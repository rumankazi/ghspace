import type { DashboardBucket } from "@ghspace/core";
import { ChevronRight, TriangleAlert } from "lucide-react";
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
      <span className="text-muted-foreground text-xs tabular-nums">
        {bucket.pullRequests.length}
      </span>

      {/* Shown on the closed summary too: a failing bump must not be able to
          hide inside a collapsed bucket. */}
      {bucket.needsAttentionCount > 0 ? (
        <span className="text-destructive inline-flex items-center gap-1 text-xs">
          <TriangleAlert className="size-3" aria-hidden />
          {bucket.needsAttentionCount} need
          {bucket.needsAttentionCount === 1 ? "s" : ""} attention
        </span>
      ) : null}

      <p className="text-muted-foreground ml-auto hidden text-xs lg:block">
        {bucket.description}
      </p>
    </>
  );
}

export function BucketSection({ bucket }: { bucket: DashboardBucket }) {
  // An empty bucket is good news, not a gap worth a row of chrome.
  if (bucket.pullRequests.length === 0) return null;

  const list = (
    <ul className="divide-border divide-y">
      {bucket.pullRequests.map((pr) => (
        <PullRequestCard key={pr.id} pr={pr} />
      ))}
    </ul>
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
