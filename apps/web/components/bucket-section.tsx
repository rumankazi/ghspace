import type { DashboardBucket, RepositoryGroup } from "@ghspace/core";
import { ChevronRight, Lock } from "lucide-react";
import { AttentionChip } from "@/components/attention-chip";
import { PullRequestCard } from "@/components/pull-request-card";
import { cn } from "@/lib/utils";

/**
 * Accent colour per bucket. Deliberately restrained — only the buckets that
 * represent an actual obligation get a colour, so the page has one obvious
 * place for the eye to land.
 */
const ACCENTS: Record<string, string> = {
  blocked_on_you: "bg-destructive",
  needs_your_action: "bg-warning",
  ready_to_merge: "bg-success",
};

function Header({ bucket }: { bucket: DashboardBucket }) {
  return (
    <>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          ACCENTS[bucket.key] ?? "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <h2 className="text-sm font-semibold tracking-tight">{bucket.label}</h2>
      <span className="text-muted-foreground text-xs tabular-nums">{bucket.count}</span>

      {/* Shown on the closed summary too: a failing bump must not be able to
          hide inside a collapsed bucket. */}
      <AttentionChip count={bucket.needsAttentionCount} />

      <p className="text-muted-foreground ml-auto hidden text-xs lg:block">
        {bucket.description}
      </p>
    </>
  );
}

/**
 * The repository a run of rows belongs to.
 *
 * Quieter than the bucket heading above it — smaller, tinted, no accent dot —
 * because the bucket is still the thing being triaged. The repository only
 * answers "where", and answering it once per run is cheaper to read than the
 * same `owner/name` repeated down every row, which is why the rows below drop
 * their own copy.
 */
function RepositoryHeading({ group }: { group: RepositoryGroup }) {
  return (
    <div className="border-border bg-muted/30 text-muted-foreground flex items-baseline gap-2 border-b px-4 py-1.5">
      {group.repository.isPrivate ? (
        <Lock className="size-3 shrink-0 self-center" aria-label="Private" />
      ) : null}

      <h3 className="font-mono text-xs">{group.repository.nameWithOwner}</h3>
      <span className="text-xs tabular-nums">{group.pullRequests.length}</span>

      <AttentionChip count={group.needsAttentionCount} />
    </div>
  );
}

export function BucketSection({ bucket }: { bucket: DashboardBucket }) {
  // An empty bucket is good news, not a gap worth a row of chrome.
  if (bucket.count === 0) return null;

  const list = (
    <div className="divide-border divide-y">
      {bucket.groups.map((group) => (
        <div key={group.repository.id}>
          <RepositoryHeading group={group} />
          <ul className="divide-border divide-y">
            {group.pullRequests.map((pr) => (
              <PullRequestCard key={pr.id} pr={pr} showRepository={false} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  // `details` rather than client state: the collapse survives a server refresh,
  // works without JavaScript, and needs no hydration for what is a disclosure
  // triangle.
  if (bucket.collapsed) {
    return (
      <details className="border-border bg-card group overflow-hidden rounded-lg border">
        <summary className="border-border hover:bg-accent/40 flex cursor-pointer list-none items-baseline gap-2.5 border-b px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <Header bucket={bucket} />
        </summary>
        {list}
      </details>
    );
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <header className="border-border flex items-baseline gap-2.5 border-b px-4 py-3">
        <Header bucket={bucket} />
      </header>
      {list}
    </section>
  );
}
