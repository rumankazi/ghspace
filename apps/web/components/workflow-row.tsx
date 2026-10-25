import type { WorkflowSummary } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HealthIcon } from "@/components/workflow-health";

/**
 * The run's own words for what happened, where the four-state health is too
 * coarse — "failing" does not distinguish a test failure from a job that
 * never started, and the difference is the first thing a reader wants.
 *
 * Maps rather than object literals because the key comes from GitHub: a
 * conclusion this build has never heard of must miss the lookup, not index
 * into a dictionary that claims every string is a key.
 */
const CONCLUSIONS = new Map([
  ["failure", "Failed"],
  ["timed_out", "Timed out"],
  ["startup_failure", "Could not start"],
  ["action_required", "Waiting for approval"],
  ["cancelled", "Cancelled"],
  ["skipped", "Skipped"],
  ["neutral", "Neutral"],
  ["stale", "Stale"],
  ["success", "Passed"],
]);

/** `schedule` and `workflow_dispatch` are worth naming; a push is not. */
const EVENTS = new Map([
  ["schedule", "scheduled"],
  ["workflow_dispatch", "run by hand"],
  ["release", "release"],
  ["repository_dispatch", "dispatched"],
]);

function outcome(workflow: WorkflowSummary): string {
  if (!workflow.hasRun) return "Never run on this branch";

  if (workflow.conclusion) return CONCLUSIONS.get(workflow.conclusion) ?? workflow.conclusion;

  return workflow.status === "queued" ? "Queued" : "In progress";
}

/**
 * One workflow, with its latest default-branch run.
 *
 * The whole row links to the run on github.com, because every follow-up
 * question — which step failed, what the log says, re-run it — is answered
 * there and nowhere here. A workflow with no run has nothing to link to, and
 * stays plain text rather than linking somewhere that is not what it says.
 */
export function WorkflowRow({ workflow }: { workflow: WorkflowSummary }) {
  const ran = workflow.runStartedAt;
  const age = ran ? `${formatDistanceToNowStrict(ran)} ago` : null;
  const event = workflow.event ? EVENTS.get(workflow.event) : null;

  return (
    <li className="hover:bg-accent/40 group relative flex items-baseline gap-3 px-4 py-2.5 transition-colors">
      <HealthIcon health={workflow.health} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {workflow.runUrl ? (
            <a
              href={workflow.runUrl}
              target="_blank"
              rel="noreferrer"
              // Stretched link, as on a pull request row: the row is the click
              // target while the accessible name stays the workflow itself.
              className="after:absolute after:inset-0 truncate text-sm font-medium hover:underline"
            >
              {workflow.name}
            </a>
          ) : (
            <span className="truncate text-sm font-medium">{workflow.name}</span>
          )}

          {workflow.runNumber !== null ? (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              #{workflow.runNumber}
            </span>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {outcome(workflow)}
          {event ? ` · ${event}` : ""}
          {age ? ` · ${age}` : ""}
          {workflow.headCommitMessage
            ? ` · ${workflow.headCommitMessage.split("\n")[0]}`
            : ""}
        </p>
      </div>

      {workflow.actor.login ? (
        <Avatar className="hidden size-5 shrink-0 sm:block" title={workflow.actor.login}>
          {workflow.actor.avatarUrl ? (
            <AvatarImage src={workflow.actor.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback className="text-[9px]">
            {workflow.actor.login.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : null}
    </li>
  );
}
