import {
  AppNavSkeleton,
  BucketSectionSkeleton,
  CoveragePanelSkeleton,
  LoadingLabel,
} from "@/components/skeletons";

/**
 * Two buckets rather than the four the dashboard can show. Guessing high means
 * the page shortens as it loads, which looks like something failed; guessing
 * low only ever grows, which reads as more arriving.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LoadingLabel>Loading your pull requests</LoadingLabel>
      <AppNavSkeleton />

      <div className="space-y-4">
        <BucketSectionSkeleton rows={3} />
        <BucketSectionSkeleton rows={2} />
      </div>

      <div className="mt-8">
        <CoveragePanelSkeleton />
      </div>
    </div>
  );
}
