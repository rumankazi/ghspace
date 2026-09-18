import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import { log } from "../lib/logger.ts";

/**
 * A run interrupted mid-flight — Ctrl+C, a container stop, a crash — never gets
 * the chance to record its outcome, so its row stays "running" forever.
 *
 * That matters because the dashboard reports the most recent run's status: a
 * single abandoned row would leave the interface claiming a sync is in progress
 * indefinitely. Marking them on startup is the recovery, and it has to be a
 * sweep rather than a signal handler because SIGKILL and power loss cannot be
 * caught.
 *
 * The threshold only needs to exceed the longest plausible run. Anything still
 * genuinely running after it would be reaped, so it is deliberately generous.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

export async function reapInterruptedRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const reaped = await db()
    .update(syncRuns)
    .set({
      status: "failed",
      finishedAt: sql`now()`,
      error: "Interrupted before completion; the process exited mid-run.",
    })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.startedAt, cutoff)))
    .returning({ id: syncRuns.id });

  if (reaped.length > 0) {
    log.warn("marked interrupted sync runs as failed", { count: reaped.length });
  }

  return reaped.length;
}

/**
 * Records a run that threw.
 *
 * Every sync entry point needs this in its `catch`, and the row must be written
 * before the error is rethrown — otherwise the failure propagates while the row
 * stays "running", and only the staleness sweep above corrects it half an hour
 * later.
 *
 * Takes the message rather than the error: narrowing a `catch` binding is the
 * caller's boundary, and doing it here would mean an `unknown` parameter. The
 * caller needs the string for its own log line anyway, and each logs a
 * different set of identifying fields, so a shared log call here would have to
 * either drop them or take a bag of optional ones.
 */
export async function failRun(syncRunId: string, message: string): Promise<void> {
  await db()
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error: message })
    .where(eq(syncRuns.id, syncRunId));
}

/**
 * Closes out a specific run that is being abandoned deliberately, so a Ctrl+C
 * does not have to wait out the staleness threshold above.
 */
export async function abandonRun(syncRunId: string, reason: string): Promise<void> {
  await db()
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error: reason })
    .where(and(eq(syncRuns.id, syncRunId), eq(syncRuns.status, "running")));
}
