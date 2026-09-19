import type { RepositoryGroup } from "@ghspace/core";
import { ChevronRight, Lock } from "lucide-react";
import { PullRequestCard } from "@/components/pull-request-card";

/**
 * One repository's slice of the browse view.
 *
 * Open by default: grouping is what the page is for, and a screen of shut
 * folders hides the very thing the reader came to see. `details` rather than
 * client state, as on the triage view — the collapse survives a server refresh,
 * works without JavaScript, and needs no hydration for a disclosure triangle.
 *
 * The rows inside drop their repository label, since the header above them is
 * already saying it.
 */
export function RepositorySection({ group }: { group: RepositoryGroup }) {
  return (
    <details open className="border-border bg-card group overflow-hidden rounded-lg border">
      <summary className="border-border hover:bg-accent/40 flex cursor-pointer list-none items-baseline gap-2.5 border-b px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />

        {group.repository.isPrivate ? (
          <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Private" />
        ) : null}

        <h2 className="font-mono text-sm font-semibold tracking-tight">
          {group.repository.nameWithOwner}
        </h2>

        <span className="text-muted-foreground text-xs tabular-nums">
          {group.pullRequests.length}
        </span>
      </summary>

      <ul className="divide-border divide-y">
        {group.pullRequests.map((pr) => (
          <PullRequestCard key={pr.id} pr={pr} showRepository={false} />
        ))}
      </ul>
    </details>
  );
}
