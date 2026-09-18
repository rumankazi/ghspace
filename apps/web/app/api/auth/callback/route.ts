import { NextResponse, type NextRequest } from "next/server";
import { db, users } from "@ghspace/core/db";
import { createGitHubClient, exchangeCodeForTokens, fetchViewer } from "@ghspace/core/github";
import { persistTokens } from "@ghspace/core/sync";
import { log } from "@ghspace/core";
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

  if (!(await consumeState(params.get("state")))) {
    return failed("Sign-in link expired or was tampered with. Please try again.");
  }

  const code = params.get("code");
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
    return NextResponse.redirect(`${appBaseUrl()}/dashboard`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("sign-in failed", { error: message });
    return failed("Could not complete sign-in with GitHub.");
  }
}
