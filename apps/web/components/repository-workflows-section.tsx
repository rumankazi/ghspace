import type { RepositoryActions } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, GitBranch, Lock } from "lucide-react";
import { HealthChip } from "@/components/workflow-health";
import { WorkflowRow } from "@/components/workflow-row";

/**
 * One repository's workflows.
 *
 * Open only when something is failing or still running. The triage view folds
 * its quiet buckets for the same reason: a screen of green repositories pushes
 * the one red workflow below the fold, and this page exists to put that
 * workflow in front of the reader. `details` rather than client state, as
 * elsewhere — the collapse survives a server refresh and needs no hydration.
 */
export function RepositoryWorkflowsSection({ group }: { group: RepositoryActions }) {
  const open = group.health === "failing" || group.health === "running";
  const count = group.health === "failing" ? group.failingCount : group.runningCount;

  return (
    <details
      open={open}
      className="border-border bg-card group overflow-hidden rounded-lg border"
    >
      <summary className="border-border hover:bg-accent/40 flex cursor-pointer list-none items-baseline gap-2.5 border-b px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />

        {group.repository.isPrivate ? (
          <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Private" />
        ) : null}

        <h2 className="truncate font-mono text-sm font-semibold tracking-tight">
          {group.repository.nameWithOwner}
        </h2>

        {group.repository.defaultBranch ? (
          <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
            <GitBranch className="size-3" aria-hidden />
            {group.repository.defaultBranch}
          </span>
        ) : null}

        <span className="text-muted-foreground text-xs tabular-nums">
          {group.workflows.length}
        </span>

        <HealthChip health={group.health} count={count} />

        {group.lastRunAt ? (
          <span className="text-muted-foreground ml-auto hidden shrink-0 text-xs sm:block">
            {formatDistanceToNowStrict(group.lastRunAt)} ago
          </span>
        ) : null}
      </summary>

      <ul className="divide-border divide-y">
        {group.workflows.map((workflow) => (
          <WorkflowRow key={workflow.id} workflow={workflow} />
        ))}
      </ul>
    </details>
  );
}
