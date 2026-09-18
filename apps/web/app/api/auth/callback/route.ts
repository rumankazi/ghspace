import { NextResponse, type NextRequest } from "next/server";
import { getInstallationCoverage, log } from "@ghspace/core";
import { db, users } from "@ghspace/core/db";
import { createGitHubClient, exchangeCodeForTokens, fetchViewer } from "@ghspace/core/github";
import { persistTokens, syncUserAccess } from "@ghspace/core/sync";
import { appBaseUrl } from "@/lib/env";
import { consumeState } from "@/lib/oauth-state";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function failed(reason: string) {
  return NextResponse.redirect(`${appBaseUrl()}/?error=${encodeURIComponent(reason)}`);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // GitHub reports a denied authorisation here rather than by omitting `code`.
  const oauthError = params.get("error");
  if (oauthError) return failed(params.get("error_description") ?? oauthError);

  // Present only when the user arrived by way of an installation: "install",
  // "update", or "request". Note `installation_id` is deliberately ignored —
  // GitHub documents it as spoofable, so it is treated as a hint that an
  // install happened and nothing more. What ghspace believes about coverage
  // comes from `syncUserAccess`, which asks GitHub using this user's own token.
  const setupAction = params.get("setup_action");
  const code = params.get("code");

  // Someone without owner rights asked for the app on an organisation. GitHub
  // recorded a request and installed nothing, so there is no token to exchange
  // and nothing has gone wrong — saying so beats an error page.
  if (setupAction === "request" && !code) {
    return NextResponse.redirect(`${appBaseUrl()}/setup?pending=1`);
  }

  if (!(await consumeState(params.get("state")))) {
    // An install begun on GitHub's own app page cannot carry our state: with
    // "Request user authorization (OAuth) during installation" enabled, GitHub
    // builds the authorize URL itself and we never got to issue one. That is a
    // legitimate arrival, but an unverifiable one, so the code must not be
    // spent on a sign-in — doing that would let a crafted link sign someone in
    // as an attacker. Starting a fresh, state-protected round trip instead is
    // invisible to the user, because GitHub will not prompt again for an app
    // they just authorised.
    if (setupAction) return NextResponse.redirect(`${appBaseUrl()}/api/auth/login`);

    return failed("Sign-in link expired or was tampered with. Please try again.");
  }

  if (!code) return failed("GitHub did not return an authorization code.");

  try {
    const tokens = await exchangeCodeForTokens(code, `${appBaseUrl()}/api/auth/callback`);
    const viewer = await fetchViewer(createGitHubClient({ token: tokens.accessToken }));

    // Keyed on the numeric GitHub id, not the login: people rename accounts,
    // and a rename must not create a second user with an orphaned dashboard.
    const profile = {
      githubLogin: viewer.login,
      name: viewer.name ?? null,
      email: viewer.email ?? null,
      avatarUrl: viewer.avatarUrl ?? null,
      updatedAt: new Date(),
    };

    const [user] = await db()
      .insert(users)
      .values({ githubUserId: viewer.databaseId, ...profile })
      .onConflictDoUpdate({ target: users.githubUserId, set: profile })
      .returning({ id: users.id });

    await persistTokens(user!.id, tokens);
    await createSession(user!.id);

    log.info("user signed in", { userId: user!.id, login: viewer.login });

    // A brand new installation is invisible until an access sync records it:
    // `user_installations` is written here and nowhere else, and the worker
    // joins through that table to decide what to sync. Without this, a user who
    // just installed the app would land on an empty dashboard and have to press
    // Refresh to make their own installation exist.
    //
    // Skipped for a returning user who already has coverage — re-listing it on
    // every sign-in would spend their personal rate limit to learn nothing.
    let coverage = await getInstallationCoverage(user!.id);
    if (setupAction || coverage.length === 0) {
      try {
        await syncUserAccess(user!.id);
        coverage = await getInstallationCoverage(user!.id);
      } catch (error) {
        // Sign-in has already succeeded; a failed sync is a stale dashboard,
        // not a reason to bounce the user back to the door.
        log.warn("post-sign-in access sync failed", {
          userId: user!.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Nothing to triage until the app is installed somewhere, so send those
    // users to the step that fixes it rather than to an empty dashboard.
    const destination = coverage.length > 0 ? "/dashboard" : "/setup";
    return NextResponse.redirect(`${appBaseUrl()}${destination}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("sign-in failed", { error: message });
    return failed("Could not complete sign-in with GitHub.");
  }
}
