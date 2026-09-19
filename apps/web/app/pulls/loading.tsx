import {
  AppNavSkeleton,
  LoadingLabel,
  PullRequestFiltersSkeleton,
  PullRequestRowsSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PullsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LoadingLabel>Loading pull requests</LoadingLabel>
      <AppNavSkeleton />
      <PullRequestFiltersSkeleton />

      {/* The count line above the list. */}
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-40" />
      </div>

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <PullRequestRowsSkeleton rows={8} />
      </div>
    </div>
  );
}
