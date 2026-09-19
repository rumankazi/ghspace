import type { SyncState } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
 * the exact counts live one hover away.
 *
 * The hover card is the button's alone. Everything worth reading is on it, so
 * there is one target rather than two, and the age beside it carries no tooltip
 * of its own — a bare <span> cannot take keyboard focus, so a tooltip there
 * would have been reachable by mouse only.
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="submit"
            // The budget stays in the accessible name rather than relying on the
            // tooltip's aria-describedby, which exists only while the card is
            // open. A screen reader user who never triggers the hover should
            // still be told what pressing this will spend.
            aria-label={budget ? `Refresh now. ${budget.label}` : "Refresh now"}
            className="border-input bg-background hover:bg-accent focus-visible:ring-ring/50 relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
          >
            {/* Decorative: everything it encodes is in the accessible name. */}
            {budget ? (
              <span
                aria-hidden
                className={cn("absolute inset-x-0 bottom-0", budget.tone)}
                style={{ height: `${budget.percent}%` }}
              />
            ) : null}

            {/* Above the fill, and tinted by nothing, so the icon stays the
                thing you read first at any budget level. */}
            <RefreshCw
              className={cn("text-foreground relative size-3.5", running && "animate-spin")}
              aria-hidden
            />
          </button>
        </TooltipTrigger>

        <TooltipContent side="bottom" align="end" className="max-w-56">
          <p className={cn("font-medium", failed && "text-warning")}>{syncHeadline(sync)}</p>

          {failed ? <p className="text-warning">The last refresh failed.</p> : null}

          <p className="text-muted-foreground mt-2 font-medium">GitHub API budget</p>

          {budget ? (
            <>
              <p className="tabular-nums">
                {budget.remaining.toLocaleString()} of {budget.limit.toLocaleString()} points left
              </p>
              {budget.resets ? <p className="text-muted-foreground">{budget.resets}</p> : null}
            </>
          ) : (
            // Says why the button is unfilled instead of leaving it a mystery.
            <p className="text-muted-foreground">Unknown until the next sync reports it.</p>
          )}
        </TooltipContent>
      </Tooltip>

      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs tabular-nums",
          failed ? "text-warning" : "text-muted-foreground",
        )}
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
 * to be granted more, so the button stays unfilled until a sync supplies a real
 * ceiling. Production reported 5,326 points remaining on its first run after
 * the column landed, which is above that floor — the invented denominator would
 * have been wrong on this very account.
 */
function budgetOf(sync: SyncState) {
  const { rateLimitRemaining: remaining, rateLimitLimit: limit } = sync;

  if (remaining === null || limit === null || limit <= 0) return null;

  const fraction = Math.min(1, Math.max(0, remaining / limit));

  return {
    remaining,
    limit,
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
      ? `Resets ${formatDistanceToNowStrict(sync.rateLimitResetAt, { addSuffix: true })}`
      : null,
  };
}

/**
 * Deliberately coarser than the hover card. This sits beside a button in a
 * header that reflows, so it has to stay short enough not to resize the nav as
 * the snapshot ages from "2m" to "17 minutes".
 */
function compactAge(at: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));

  if (minutes < 1) return "just now";

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

function syncHeadline(sync: SyncState): string {
  if (sync.status === "never") return "Not synced yet";

  return sync.lastSuccessAt
    ? `Synced ${formatDistanceToNowStrict(sync.lastSuccessAt, { addSuffix: true })}`
    : "Sync has not succeeded yet";
}
