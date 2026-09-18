import { z } from "zod";
import { env } from "../env.ts";

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const errorResponse = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export interface UserTokens {
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string[];
}

function parse(body: unknown): UserTokens {
  const failure = errorResponse.safeParse(body);
  if (failure.success) {
    throw new Error(
      `GitHub OAuth error: ${failure.data.error}${
        failure.data.error_description ? ` — ${failure.data.error_description}` : ""
      }`,
    );
  }
  const data = tokenResponse.parse(body);
  const now = Date.now();
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: data.expires_in ? new Date(now + data.expires_in * 1000) : null,
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1000)
      : null,
    scopes: data.scope ? data.scope.split(",").filter(Boolean) : [],
  };
}

async function postToken(params: Record<string, string>): Promise<UserTokens> {
  const response = await fetch(`${env().GITHUB_WEB_BASE_URL}/login/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env().GITHUB_APP_CLIENT_ID,
      client_secret: env().GITHUB_APP_CLIENT_SECRET,
      ...params,
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub OAuth request failed: ${response.status} ${response.statusText}`);
  }
  return parse(await response.json());
}

/** Exchanges the `code` from the OAuth callback for a user-to-server token. */
export function exchangeCodeForTokens(code: string, redirectUri?: string) {
  return postToken({ code, ...(redirectUri ? { redirect_uri: redirectUri } : {}) });
}

/**
 * GitHub App user tokens expire in ~8 hours, so this runs on a schedule rather
 * than only on a 401. The returned refresh token replaces the old one — GitHub
 * rotates it on every use, so failing to persist the new one locks the user out.
 */
export function refreshUserTokens(refreshToken: string) {
  return postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(`${env().GITHUB_WEB_BASE_URL}/login/oauth/authorize`);
  url.searchParams.set("client_id", env().GITHUB_APP_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}
