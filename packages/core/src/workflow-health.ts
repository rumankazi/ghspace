import type { WorkflowRunConclusion, WorkflowRunStatus } from "./db/schema.ts";

/**
 * How a workflow or a repository reads at a glance.
 *
 * Four states rather than GitHub's nine conclusions, because the question the
 * Actions view answers is what to do next: look at it, wait for it, or nothing.
 *
 * Kept in its own module, like `sync/buckets.ts`, so the classification can be
 * tested as the pure function it is — importing the read path would drag in the
 * database client and its environment.
 */
export type WorkflowHealth = "failing" | "running" | "passing" | "idle";

const FAILING = new Set<WorkflowRunConclusion>([
  "failure",
  "timed_out",
  "startup_failure",
  // Not a failure in GitHub's vocabulary: a run waiting on a deployment
  // approval or on a first-time contributor. It is still something a person
  // has to go and do, which is what this view is for.
  "action_required",
]);

const RUNNING = new Set<WorkflowRunStatus>([
  "queued",
  "in_progress",
  "waiting",
  "requested",
  "pending",
]);

export interface WorkflowRunVerdict {
  /** Null when the workflow has never run on the branch in question. */
  runId: number | null;
  status: WorkflowRunStatus | null;
  conclusion: WorkflowRunConclusion | null;
}

/**
 * One workflow's state, from its latest run.
 *
 * `cancelled`, `skipped`, `neutral` and `stale` land on `idle` rather than on
 * either verdict: none of them says the branch is broken, and none says it
 * builds. Treating them as passing is the tempting shortcut and the wrong one —
 * a workflow whose runs are all cancelled would then read as green.
 *
 * A concluded run beats a status, because GitHub leaves `status: completed` on
 * a finished run and the conclusion is the part that says how it went.
 */
export function workflowHealth(run: WorkflowRunVerdict): WorkflowHealth {
  if (run.runId === null) return "idle";

  if (run.conclusion !== null) {
    if (FAILING.has(run.conclusion)) return "failing";

    return run.conclusion === "success" ? "passing" : "idle";
  }

  if (run.status !== null && RUNNING.has(run.status)) return "running";

  return "idle";
}

/** Ordered by how much it wants the reader's attention. */
export const HEALTH_SEVERITY: Record<WorkflowHealth, number> = {
  failing: 3,
  running: 2,
  passing: 1,
  idle: 0,
};

/**
 * A repository's state: the worst of its workflows.
 *
 * Worst rather than newest. A repository whose deploy workflow is red and
 * whose linter went green a minute later is a repository with a broken deploy,
 * and reporting the most recent verdict would hide exactly that.
 */
export function worstHealth(states: WorkflowHealth[]): WorkflowHealth {
  return states.reduce<WorkflowHealth>(
    (held, state) => (HEALTH_SEVERITY[state] > HEALTH_SEVERITY[held] ? state : held),
    "idle",
  );
}
