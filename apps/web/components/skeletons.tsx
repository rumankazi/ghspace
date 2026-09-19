import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholders for the authenticated views.
 *
 * Every one of these mirrors the real markup it stands in for — same padding,
 * same line heights, same columns — because a placeholder whose shape differs
 * from what replaces it turns the arrival of data into a visible jolt, which
 * is worse than having shown nothing at all.
 */

/**
 * Cycled rather than random. A random width would differ between the server
 * render and hydration, and React would be right to complain; cycling also
 * keeps the list from looking like a bar chart of identical rows.
 */
const TITLE_WIDTHS = ["w-3/5", "w-11/12", "w-2/5", "w-3/4", "w-1/2", "w-4/5"];

/** Announces the wait once for the whole screen. */
export function LoadingLabel({ children }: { children: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {children}
    </span>
  );
}

export function AppNavSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
      {/* The view switcher: two tabs inside a p-1 pill. */}
      <Skeleton className="mr-auto h-9 w-52 rounded-lg" />
      {/* The refresh button, its budget gauge, and the age beside it. */}
      <Skeleton className="size-8" />
      <Skeleton className="h-3.5 w-14" />
      <Skeleton className="size-8" />
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

function PullRequestRowSkeleton({ index }: { index: number }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />

      <div className="min-w-0 flex-1">
        {/* Fixed line boxes, so the row is exactly as tall as the card that
            replaces it: 20px title + 4px gap + 16px meta. */}
        <div className="flex h-5 items-center">
          <Skeleton className={cn("h-3.5", TITLE_WIDTHS[index % TITLE_WIDTHS.length])} />
        </div>
        <div className="mt-1 flex h-4 items-center">
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="size-3.5 rounded-full" />
      </div>
    </li>
  );
}

/** Only ever seen inside a section skeleton now, never on its own. */
function PullRequestRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-border divide-y">
      {Array.from({ length: rows }, (_, index) => (
        <PullRequestRowSkeleton key={index} index={index} />
      ))}
    </ul>
  );
}

/** The tinted `owner/name` strip that heads each repository inside a bucket. */
function RepositoryHeadingSkeleton() {
  return (
    <div className="border-border bg-muted/30 flex h-7 items-center gap-2 border-b px-4">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="h-2.5 w-3" />
    </div>
  );
}

/** Stands in for a `BucketSection`: bordered card, header strip, grouped rows. */
export function BucketSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex h-11 items-center gap-2.5 border-b px-4">
        <Skeleton className="size-2 shrink-0 rounded-full" />
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-4" />
      </div>
      <RepositoryHeadingSkeleton />
      <PullRequestRowsSkeleton rows={rows} />
    </div>
  );
}

/** Stands in for a `RepositorySection`: chevron, repository name, count, rows. */
export function RepositorySectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex h-11 items-center gap-2.5 border-b px-4">
        <Skeleton className="size-3.5 shrink-0" />
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-4" />
      </div>
      <PullRequestRowsSkeleton rows={rows} />
    </div>
  );
}

export function PullRequestFiltersSkeleton() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Skeleton className="h-8 min-w-52 flex-1" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export function CoveragePanelSkeleton() {
  return (
    <div className="border-border bg-card rounded-lg border">
      <div className="border-border flex h-11 items-center gap-2 border-b px-4">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="ml-auto h-3 w-32" />
      </div>
      <div className="divide-border divide-y">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex h-9 items-center gap-2.5 px-4">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="size-3 rounded-sm" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
