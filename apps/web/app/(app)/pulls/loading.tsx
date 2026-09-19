import {
  LoadingLabel,
  PullRequestFiltersSkeleton,
  RepositorySectionSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PullsLoading() {
  return (
    <div>
      <LoadingLabel>Loading pull requests</LoadingLabel>
      <PullRequestFiltersSkeleton />

      {/* The count line above the list. */}
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-40" />
      </div>

      {/* Two repositories' worth: enough to read as grouped rather than flat. */}
      <div className="space-y-3">
        <RepositorySectionSkeleton rows={4} />
        <RepositorySectionSkeleton rows={3} />
      </div>
    </div>
  );
}
