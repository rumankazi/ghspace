import { CoveragePanelSkeleton, LoadingLabel } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function SetupLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <LoadingLabel>Loading your installations</LoadingLabel>

      <div className="space-y-3">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>

      <Skeleton className="mt-8 h-10 w-60" />

      <div className="mt-10">
        <CoveragePanelSkeleton />
      </div>
    </main>
  );
}
