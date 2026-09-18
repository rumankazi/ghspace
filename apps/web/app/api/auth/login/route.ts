import { NextResponse } from "next/server";
import { authorizeUrl } from "@ghspace/core/github";
import { appBaseUrl } from "@/lib/env";
import { issueState } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await issueState();
  const redirectUri = `${appBaseUrl()}/api/auth/callback`;

  return NextResponse.redirect(authorizeUrl(state, redirectUri));
}
