import { closeDb, db, users } from "@ghspace/core/db";
import { env, log } from "@ghspace/core";
import {
  CredentialsUnusableError,
  listInstallationsForSync,
  syncInstallation,
  syncUserAccess,
} from "@ghspace/core/sync";

/**
 * The background sync loop.
 *
 * Two schedules, because the two jobs have different costs and change at very
 * different rates:
 *
 *   - **Installation sync** fetches every open pull request in each
 *     installation. It runs often, spends the installation's own dedicated rate
 *     limit, and its output is shared by every ghspace user in that account.
 *   - **Access sync** refreshes which repositories each user may see. It runs
 *     rarely, spends that user's personal rate limit, and exists to enforce a
 *     security boundary rather than to keep data fresh.
 *
 * Everything the dashboard shows is written here, which is what lets the web app
 * read purely from Postgres.
 */

let shuttingDown = false;
let pullRequestCycleInFlight = false;
let accessCycleInFlight = false;

/** Access is re-checked every Nth pull request cycle. */
const ACCESS_EVERY_N_CYCLES = 10;

async function syncAllInstallations(): Promise<void> {
  if (pullRequestCycleInFlight) {
    log.warn("skipping sync cycle: previous cycle still running");
    return;
  }
  pullRequestCycleInFlight = true;
  const startedAt = Date.now();

  try {
    const targets = await listInstallationsForSync();
    if (targets.length === 0) {
      log.info("no installations registered yet; nothing to sync");
      return;
    }

    let succeeded = 0;
    let failed = 0;

    // Sequential on purpose. Each installation has its own rate limit budget so
    // there is no shared quota to race over, but serialising keeps concurrent
    // load on both GitHub and Postgres predictable.
    for (const target of targets) {
      if (shuttingDown) break;
      try {
        await syncInstallation(target.id);
        succeeded++;
      } catch (error) {
        failed++;
        log.error("installation sync failed", {
          installation: target.accountLogin,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.info("pull request cycle complete", {
      installations: targets.length,
      succeeded,
      failed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    // A failure out here is infrastructure, most likely Postgres. Log and let
    // the next tick retry rather than exiting and losing the schedule.
    log.error("pull request cycle aborted", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    pullRequestCycleInFlight = false;
  }
}

async function syncAllUserAccess(): Promise<void> {
  if (accessCycleInFlight) return;
  accessCycleInFlight = true;

  try {
    const everyone = await db()
      .select({ id: users.id, login: users.githubLogin })
      .from(users);

    for (const user of everyone) {
      if (shuttingDown) break;
      try {
        await syncUserAccess(user.id);
      } catch (error) {
        if (error instanceof CredentialsUnusableError) {
          // Not retryable: the user has to re-authorise. Logged at warn so it
          // does not read as a system fault.
          log.warn("skipping user with unusable credentials", {
            login: user.login,
            error: error.message,
          });
        } else {
          log.error("user access sync failed", {
            login: user.login,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    log.error("access cycle aborted", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    accessCycleInFlight = false;
  }
}

async function main(): Promise<void> {
  const intervalMs = env().SYNC_INTERVAL_SECONDS * 1000;
  log.info("worker started", { intervalSeconds: env().SYNC_INTERVAL_SECONDS });

  // Access first: an installation sync can only build involvement for users
  // whose repository access is already known.
  await syncAllUserAccess();
  await syncAllInstallations();

  let cycle = 0;
  while (!shuttingDown) {
    // A little jitter so that several self-hosted instances, or a restart loop,
    // do not line up and hit GitHub in lockstep.
    const jitter = Math.floor(Math.random() * intervalMs * 0.1);
    await sleep(intervalMs + jitter);
    if (shuttingDown) break;

    cycle++;
    if (cycle % ACCESS_EVERY_N_CYCLES === 0) await syncAllUserAccess();
    if (shuttingDown) break;
    await syncAllInstallations();
  }

  log.info("worker stopped");
  await closeDb();
}

const shutdownWaiters: (() => void)[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Do not hold the process open if it is on its way out.
    timer.unref?.();
    shutdownWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    log.info("shutdown signal received; finishing current work", { signal });
    shuttingDown = true;
    while (shutdownWaiters.length > 0) shutdownWaiters.pop()?.();
  });
}

await main();
