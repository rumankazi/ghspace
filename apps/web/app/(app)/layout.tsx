import { Suspense } from "react";
import { getSyncState } from "@ghspace/core";
import { AppNav } from "@/components/app-nav";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppNavSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/current-user";

/**
 * The shell every signed-in view sits inside.
 *
 * The nav used to be rendered by each page, which meant it was torn down and
 * rebuilt on every navigation. Two things follow from that, and both are bugs
 * rather than cosmetics:
 *
 * - The refresh button is a client component holding the in-flight state of a
 *   sync. Remounting it on navigation threw that state away, so pressing
 *   Refresh and then switching tabs lost the only sign that anything was
 *   happening — the refresh itself carried on server-side, invisibly.
 * - A header that re-enters with the page animation reads as though the whole
 *   application reloaded, when only the content below it changed.
 *
 * A layout is preserved across navigations between the routes it wraps, so the
 * nav now holds still and keeps its state while `{children}` swaps underneath.
 *
 * The route group exists to draw that boundary: `/setup` and the sign-in page
 * are outside it, because neither has anything to refresh.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <AutoRefresh />

      {/* The layout itself stays synchronous so that it does not suspend: a
          suspending layout would hand the wait to the *parent* boundary — the
          sign-in wordmark in `app/loading.tsx` — and the reader would watch
          that give way to a skeleton before any content arrived. Keeping the
          await down here means the page's own `loading.tsx` shows immediately,
          with a placeholder nav above it. */}
      <Suspense fallback={<AppNavSkeleton />}>
        <Nav />
      </Suspense>

      {children}
    </div>
  );
}

async function Nav() {
  const user = await requireUser();

  return <AppNav user={user} sync={await getSyncState(user.id)} />;
}
