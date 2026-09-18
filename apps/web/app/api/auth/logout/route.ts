import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/env";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  stale: "Your session referred to an account that no longer exists. Please sign in again.",
};

function signedOut(reason: string | null) {
  const url = new URL(appBaseUrl());
  const message = reason ? REASONS[reason] : undefined;
  if (message) url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

/** The sign-out button. */
export async function POST(request: NextRequest) {
  await destroySession();
  return signedOut(request.nextUrl.searchParams.get("reason"));
}

/**
 * Also reachable by GET, because a redirect is the only way a page render can
 * clear a cookie — Server Components cannot write them.
 *
 * Without this, a session pointing at a deleted user (after a database reset,
 * say) redirected here and hit a 405, leaving the browser stuck on an error
 * page with no way to clear the cookie that caused it.
 *
 * Accepting GET means a cross-site request could sign someone out. That is an
 * annoyance rather than a risk — no data is exposed or destroyed, and the cost
 * of refusing it is a dead end users cannot escape.
 */
export async function GET(request: NextRequest) {
  await destroySession();
  return signedOut(request.nextUrl.searchParams.get("reason"));
}
