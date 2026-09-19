import { NextResponse, type NextRequest } from "next/server";
import { listInstallationsForSync, syncInstallation, syncUserAccess } from "@ghspace/core/sync";
import { log } from "@ghspace/core";
import { appBaseUrl } from "@/lib/env";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Manual refresh. The worker is the normal path — this exists so a brand new
 * account can populate its dashboard immediately instead of waiting out the
 * first poll interval.
 *
 * This is a route handler rather than the Server Action it used to be, and the
 * reason is measurable rather than stylistic: Next queues client-side
 * navigations behind an in-flight Server Action. A sync takes seconds, so
 * pressing Refresh and then reaching for another tab did nothing at all until
 * the sync finished — driving the app with a 12-second sync, the tab change
 * landed 12.2 seconds after the click. A plain `fetch` is not part of that
 * queue, so the nav stays live while the work runs.
 *
 * Nothing here revalidates a path. Both views are `force-dynamic`, so there is
 * no server cache holding the old snapshot; what needs to hear about the new
 * one is the client router, and the caller does that with `router.refresh()`
 * once this returns.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request" }, { status: 403 });
  }

  const userId = await getSessionUserId();

  if (!userId) return done(request, 401);

  try {
    // Access first: involvement can only be derived for a user whose repository
    // access is already known.
    await syncUserAccess(userId);

    for (const installation of await listInstallationsForSync()) {
      await syncInstallation(installation.id);
    }
  } catch (error) {
    // The failure is already recorded on `sync_runs`, and the page reads that
    // to show the user what happened. Reporting it here as well would mean two
    // sources of truth for one failure, and the page's is the one that survives
    // a reload.
    log.warn("manual refresh failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return done(request, 200);
}

/**
 * The browser sends `Origin` on every POST, a plain form submission included,
 * so a request without one did not come from a page. Refusing those costs
 * nothing and stops another site from spending this user's GitHub rate limit
 * by pointing a form at us.
 *
 * The request's own origin is checked alongside the configured one because
 * `APP_BASE_URL` names the canonical URL, and a deployment reached by any other
 * hostname — a preview build, a self-host behind a second domain — would
 * otherwise have a Refresh button that always returned 403.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) return false;

  return origin === request.nextUrl.origin || origin === new URL(appBaseUrl()).origin;
}

/**
 * Without JavaScript the Refresh button is an ordinary form post, and an
 * ordinary form post has to land somewhere. The redirect is for that reader;
 * the fetch from `RefreshButton` asks for JSON and gets a status code, since
 * following a redirect would mean fetching a whole page it is about to
 * re-render anyway.
 */
function done(request: NextRequest, status: number) {
  if (request.headers.get("accept")?.includes("application/json")) {
    return new NextResponse(null, { status: status === 200 ? 204 : status });
  }

  const referer = request.headers.get("referer");

  const back = referer?.startsWith(request.nextUrl.origin)
    ? referer
    : new URL("/dashboard", request.nextUrl.origin).toString();

  return NextResponse.redirect(status === 200 ? back : new URL("/", request.nextUrl.origin), {
    status: 303,
  });
}
