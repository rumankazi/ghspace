import { LoadingLabel, WorkflowSectionSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActionsLoading() {
  return (
    <div>
      <LoadingLabel>Loading workflow status</LoadingLabel>

      {/* The summary line above the list. */}
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-64" />
      </div>

      {/* One open repository and two shut ones: the shape the page usually
          settles into, since only unhealthy repositories open. */}
      <div className="space-y-3">
        <WorkflowSectionSkeleton rows={3} />
        <WorkflowSectionSkeleton rows={0} />
        <WorkflowSectionSkeleton rows={0} />
      </div>
    </div>
  );
}
