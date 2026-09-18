import { closeDb, db, users } from "@ghspace/core/db";
import { log } from "@ghspace/core";
import {
  listInstallationsForSync,
  reapInterruptedRuns,
  syncInstallation,
  syncUserAccess,
} from "@ghspace/core/sync";
import { eq } from "drizzle-orm";

/**
 * One-off sync, for when you want to see the effect of a change immediately
 * instead of waiting for the worker's next tick.
 *
 *   bun run sync              # every user's access, then every installation
 *   bun run sync <login>      # one user's access, then every installation
 *
 * Interrupting it is safe. Each snapshot is written in a single transaction, so
 * Postgres rolls back anything half-written, and the sweeps that retire stale
 * rows are timestamp-based — re-running simply re-stamps everything. The only
 * loose end is the in-flight `sync_runs` row, which the handler below closes
 * out so the dashboard does not report a sync that is no longer happening.
 */

let interrupted = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    log.warn("interrupt received; stopping after the current step", { signal });
    log.info("nothing is left half-written — re-run when ready");
  });
}

const login = process.argv[2];

// Close out any run abandoned by an earlier interrupt before starting.
await reapInterruptedRuns();

const targets = login
  ? await db()
      .select({ id: users.id, login: users.githubLogin })
      .from(users)
      .where(eq(users.githubLogin, login))
  : await db().select({ id: users.id, login: users.githubLogin }).from(users);

if (targets.length === 0) {
  log.error(
    login ? `No user with login ${login}.` : "No users registered yet.",
    { hint: "Sign in at http://localhost:3000 first." },
  );
  await closeDb();
  process.exit(1);
}

const startedAt = Date.now();

// Access first: involvement can only be derived for users whose repository
// access is already known.
log.info("step 1 of 2: refreshing repository access", { users: targets.length });
for (const [index, target] of targets.entries()) {
  if (interrupted) break;
  log.info("syncing access", {
    login: target.login,
    user: `${index + 1}/${targets.length}`,
  });
  const access = await syncUserAccess(target.id);
  log.info("access synced", { login: target.login, ...access });
}

if (!interrupted) {
  const installations = await listInstallationsForSync();
  log.info("step 2 of 2: fetching pull requests", {
    installations: installations.length,
  });

  let pullRequests = 0;
  for (const [index, installation] of installations.entries()) {
    if (interrupted) break;
    log.info("syncing installation", {
      account: installation.accountLogin,
      installation: `${index + 1}/${installations.length}`,
    });
    const result = await syncInstallation(installation.id);
    pullRequests += result.pullRequestCount;
  }

  if (!interrupted) {
    log.info("sync complete", {
      pullRequests,
      installations: installations.length,
      ms: Date.now() - startedAt,
      next: "open http://localhost:3000/dashboard",
    });
  }
}

if (interrupted) {
  log.warn("stopped early", { ms: Date.now() - startedAt });
}

await closeDb();
process.exit(interrupted ? 130 : 0);
