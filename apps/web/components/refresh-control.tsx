import type { SyncState } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { CircleAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Below this fraction of the budget, the gauge is worth noticing. */
const LOW = 0.25;

/** Below this one, worth acting on. */
const CRITICAL = 0.1;

/**
 * Refresh, with the GitHub API budget drawn as the button's own fill level and
 * the age of the snapshot as subtext beside it.
 *
 * Three things that used to be three separate pieces of furniture are one
 * control here, because they are one thought: how stale is this, how much
 * budget is there to fix it, and the button that spends the budget to fix it.
 * The fill is the budget *remaining*, so a full button means a full tank.
 *
 * The number of points was never actionable on its own — nobody knows whether
 * 4,962 is a lot — but the fraction is, so the fill is the honest encoding and
 * the exact counts stay in the tooltip and the accessible name for when someone
 * is actually debugging a rate limit.
 */
export function RefreshControl({
  sync,
  refreshAction,
  className,
}: {
  sync: SyncState;
  refreshAction: () => Promise<void>;
  className?: string;
}) {
  const running = sync.status === "running";
  const failed = sync.status === "failed";
  const budget = budgetOf(sync);

  return (
    <form action={refreshAction} className={cn("flex items-center gap-2", className)}>
      <button
        type="submit"
        aria-label={budget ? `Refresh now. ${budget.label}` : "Refresh now"}
        title={budget ? [budget.label, budget.resets].filter(Boolean).join("\n") : undefined}
        className="border-input bg-background hover:bg-accent focus-visible:ring-ring/50 relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
      >
        {/* Decorative: everything it encodes is in the accessible name above. */}
        {budget ? (
          <span
            aria-hidden
            className={cn("absolute inset-x-0 bottom-0", budget.tone)}
            style={{ height: `${budget.percent}%` }}
          />
        ) : null}

        {/* Above the fill, and tinted by nothing, so the icon stays the thing
            you read first at any budget level. */}
        <RefreshCw
          className={cn("text-foreground relative size-3.5", running && "animate-spin")}
          aria-hidden
        />
      </button>

      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs tabular-nums",
          failed ? "text-warning" : "text-muted-foreground",
        )}
        title={syncDetail(sync)}
      >
        {failed ? <CircleAlert className="size-3 shrink-0" aria-hidden /> : null}
        {sync.lastSuccessAt ? compactAge(sync.lastSuccessAt) : "never synced"}
      </span>
    </form>
  );
}

/**
 * `rateLimitLimit` is null on sync runs recorded before it was persisted. A
 * fill level needs a denominator to mean anything, and inventing one (GitHub's
 * 5,000 floor) would under-report the budget of any installation large enough
 * to be granted more, so the button simply stays unfilled until the next sync
 * supplies a real ceiling.
 */
function budgetOf(sync: SyncState) {
  const { rateLimitRemaining: remaining, rateLimitLimit: limit } = sync;

  if (remaining === null || limit === null || limit <= 0) return null;

  const fraction = Math.min(1, Math.max(0, remaining / limit));

  return {
    // Sub-pixel fills round away to nothing, which would read as an empty
    // budget rather than a nearly-empty one.
    percent: Math.max(fraction * 100, 8),
    tone:
      fraction <= CRITICAL
        ? "bg-destructive/40"
        : fraction <= LOW
          ? "bg-warning/45"
          : "bg-muted-foreground/25",
    label: `${remaining.toLocaleString()} of ${limit.toLocaleString()} GitHub API points left`,
    resets: sync.rateLimitResetAt
      ? `Budget resets ${formatDistanceToNowStrict(sync.rateLimitResetAt, { addSuffix: true })}`
      : null,
  };
}

/**
 * Deliberately coarser than the tooltip. This sits beside a button in a header
 * that reflows, so it has to stay short enough not to resize the nav as the
 * snapshot ages from "2m" to "17 minutes".
 */
function compactAge(at: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));

  if (minutes < 1) return "just now";

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

function syncDetail(sync: SyncState): string {
  if (sync.status === "never") return "Not synced yet";

  const age = sync.lastSuccessAt
    ? `Synced ${formatDistanceToNowStrict(sync.lastSuccessAt, { addSuffix: true })}`
    : "Sync has not succeeded yet";

  return sync.status === "failed" ? `${age}\nThe last refresh failed` : age;
}
