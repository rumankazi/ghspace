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
 * Closes out a specific run that is being abandoned deliberately, so a Ctrl+C
 * does not have to wait out the staleness threshold above.
 */
export async function abandonRun(syncRunId: string, reason: string): Promise<void> {
  await db()
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error: reason })
    .where(and(eq(syncRuns.id, syncRunId), eq(syncRuns.status, "running")));
}
