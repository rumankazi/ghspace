import type { SyncState } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import { CircleAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The page renders from a cached snapshot, so it has an obligation to say how
 * old that snapshot is. Being visibly two minutes behind is fine; being
 * silently wrong is not.
 */
export function SyncStatus({ sync, className }: { sync: SyncState; className?: string }) {
  if (sync.status === "never") {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>Not synced yet</span>
    );
  }

  const stale = sync.status === "failed" && sync.lastSuccessAt !== null;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      {sync.status === "running" ? (
        <RefreshCw className="text-muted-foreground size-3 animate-spin" aria-hidden />
      ) : null}

      {stale || sync.status === "failed" ? (
        <CircleAlert className="text-warning size-3" aria-hidden />
      ) : null}

      <span className={cn(sync.status === "failed" ? "text-warning" : "text-muted-foreground")}>
        {sync.lastSuccessAt
          ? `Synced ${formatDistanceToNowStrict(sync.lastSuccessAt, { addSuffix: true })}`
          : "Sync has not succeeded yet"}
        {sync.status === "failed" ? " · last refresh failed" : ""}
      </span>

      {sync.rateLimitRemaining !== null ? (
        <span
          className="text-muted-foreground/70 hidden tabular-nums sm:inline"
          title={
            sync.rateLimitResetAt
              ? `GitHub API budget resets ${formatDistanceToNowStrict(sync.rateLimitResetAt, {
                  addSuffix: true,
                })}`
              : undefined
          }
        >
          · {sync.rateLimitRemaining.toLocaleString()} API points left
        </span>
      ) : null}
    </span>
  );
}
