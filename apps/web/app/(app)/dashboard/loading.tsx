import { BucketSectionSkeleton, CoveragePanelSkeleton, LoadingLabel } from "@/components/skeletons";

/**
 * Two buckets rather than the four the dashboard can show. Guessing high means
 * the page shortens as it loads, which looks like something failed; guessing
 * low only ever grows, which reads as more arriving.
 *
 * No nav placeholder: the nav belongs to the layout now, so on every
 * navigation after the first it is already on screen and holding still. Its
 * one placeholder lives with it, in `(app)/layout.tsx`.
 */
export default function DashboardLoading() {
  return (
    <div>
      <LoadingLabel>Loading your pull requests</LoadingLabel>

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
