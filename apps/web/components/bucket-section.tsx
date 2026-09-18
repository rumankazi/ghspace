import type { DashboardBucket } from "@ghspace/core";
import { PullRequestCard } from "@/components/pull-request-card";
import { cn } from "@/lib/utils";

/**
 * Accent colour per bucket. Deliberately restrained — only the two buckets
 * that represent an actual obligation get a colour, so the page has one
 * obvious place for the eye to land.
 */
const ACCENTS: Record<string, string> = {
  blocked_on_you: "bg-destructive",
  needs_your_action: "bg-warning",
  ready_to_merge: "bg-success",
};

export function BucketSection({ bucket }: { bucket: DashboardBucket }) {
  // An empty bucket is good news, not a gap worth a row of chrome.
  if (bucket.pullRequests.length === 0) return null;

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <header className="border-border flex items-baseline gap-2.5 border-b px-4 py-3">
        <span
          className={cn("size-2 shrink-0 rounded-full", ACCENTS[bucket.key] ?? "bg-muted-foreground/40")}
          aria-hidden
        />
        <h2 className="text-sm font-semibold tracking-tight">{bucket.label}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {bucket.pullRequests.length}
        </span>
        <p className="text-muted-foreground ml-auto hidden text-xs lg:block">
          {bucket.description}
        </p>
      </header>

      <ul className="divide-border divide-y">
        {bucket.pullRequests.map((pr) => (
          <PullRequestCard key={pr.id} pr={pr} />
        ))}
      </ul>
    </section>
  );
}
