import type { WorkflowHealth } from "@ghspace/core";
import { CheckCircle2, CircleDot, CircleSlash, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One vocabulary for workflow state, shared by the rows and the headings above
 * them.
 *
 * The same four words and the same four colours in both places: a heading that
 * said "failing" while the row below it said "broken" would read as two
 * different facts about one workflow.
 */
const HEALTH: Record<WorkflowHealth, { label: string; className: string; icon: typeof XCircle }> = {
  failing: { label: "Failing", className: "text-destructive", icon: XCircle },
  running: { label: "Running", className: "text-warning", icon: CircleDot },
  passing: { label: "Passing", className: "text-success", icon: CheckCircle2 },
  idle: { label: "No verdict", className: "text-muted-foreground", icon: CircleSlash },
};

export function HealthIcon({
  health,
  className,
}: {
  health: WorkflowHealth;
  className?: string;
}) {
  const { label, className: tone, icon: Icon } = HEALTH[health];

  return (
    <span className={cn("inline-flex shrink-0 items-center", tone, className)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The state of a whole repository, on its heading.
 *
 * Shown even when the section is shut, for the reason `AttentionChip` exists: a
 * red workflow must not be able to hide inside a folded repository.
 */
export function HealthChip({ health, count }: { health: WorkflowHealth; count: number }) {
  if (health === "failing") {
    return (
      <span className="text-destructive inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
        <XCircle className="size-3" aria-hidden />
        {count} failing
      </span>
    );
  }

  if (health === "running") {
    return (
      <span className="text-warning inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
        <CircleDot className="size-3" aria-hidden />
        {count === 0 ? "running" : `${count} running`}
      </span>
    );
  }

  return null;
}
