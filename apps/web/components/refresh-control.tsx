import type { SyncState } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { RefreshButton, type RefreshBudget } from "@/components/refresh-button";

/** Below this fraction of the budget, the gauge is worth noticing. */
const LOW = 0.25;

/** Below this one, worth acting on. */
const CRITICAL = 0.1;

/**
 * The server half of the refresh control: it owns the clock, and hands
 * `RefreshButton` finished text to draw.
 *
 * The split is not decoration. Every label here is derived from the current
 * time or from a locale-sensitive format, and both differ between the machine
 * that renders the HTML and the one that hydrates it — "2m ago" on the server
 * can be "3m ago" a second later in the browser. Formatting up here and
 * shipping strings down keeps that class of hydration mismatch impossible
 * rather than merely unlikely.
 */
export function RefreshControl({ sync, className }: { sync: SyncState; className?: string }) {
  return (
    <RefreshButton
      headline={syncHeadline(sync)}
      age={sync.lastSuccessAt ? compactAge(sync.lastSuccessAt) : "never synced"}
      failed={sync.status === "failed"}
      syncing={sync.status === "running"}
      budget={budgetOf(sync)}
      className={className}
    />
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
function budgetOf(sync: SyncState): RefreshBudget | null {
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
    counts: `${remaining.toLocaleString()} of ${limit.toLocaleString()} points left`,
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
