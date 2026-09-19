/**
 * The page transition.
 *
 * A template rather than a layout because Next gives templates a per-segment
 * key: this remounts when the route changes, so the animation replays, and —
 * the part that actually matters here — it does *not* remount on a search
 * parameter change or on `router.refresh()`. The filters on /pulls push new
 * query strings, and `AutoRefresh` re-renders every thirty seconds; either one
 * would turn a nice fade into a flicker if this were keyed any less precisely.
 *
 * It also wraps `loading.tsx`, so the skeleton is what animates in on
 * navigation and the real content cross-fades over it once it arrives.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
