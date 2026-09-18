import { NextResponse } from "next/server";
import { appBaseUrl, installUrl } from "@/lib/env";
import { issueState } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

/**
 * Sends the user to GitHub to choose which accounts ghspace may see.
 *
 * Every install link in the interface points here rather than at GitHub
 * directly, for two reasons. The state issued here comes back on the callback,
 * which is the only thing making a post-install sign-in verifiable; and routing
 * through one place means the callback can tell an install it started from one
 * begun on GitHub's own app page.
 */
export async function GET() {
  const state = await issueState();
  const url = installUrl(state);

  if (!url) {
    const reason = "This deployment has no GH_APP_SLUG configured, so ghspace cannot build an install link.";

    return NextResponse.redirect(`${appBaseUrl()}/setup?error=${encodeURIComponent(reason)}`);
  }

  return NextResponse.redirect(url);
}
