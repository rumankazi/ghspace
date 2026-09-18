import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { githubCredentials, users } from "../db/schema.ts";
import { decrypt, encrypt } from "../lib/crypto.ts";
import { log } from "../lib/logger.ts";
import { refreshUserTokens, type UserTokens } from "../github/auth.ts";

/** Refresh this far ahead of expiry so a long sync cannot outlive its token. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export class CredentialsUnusableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsUnusableError";
  }
}

export async function persistTokens(userId: string, tokens: UserTokens): Promise<void> {
  const row = {
    accessToken: encrypt(tokens.accessToken),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    scopes: tokens.scopes,
    updatedAt: new Date(),
  };
  await db()
    .insert(githubCredentials)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: githubCredentials.userId, set: row });
}

/**
 * Returns a usable access token, refreshing it first if it is close to expiry.
 *
 * GitHub rotates the refresh token on every use, so the new pair is persisted
 * before the token is handed out. If that write failed after a successful
 * refresh the old refresh token would already be dead and the user would be
 * locked out until they re-authorised.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const [record] = await db()
    .select()
    .from(githubCredentials)
    .where(eq(githubCredentials.userId, userId))
    .limit(1);

  if (!record) {
    throw new CredentialsUnusableError(`No GitHub credentials stored for user ${userId}`);
  }

  const expiresAt = record.accessTokenExpiresAt?.getTime();
  const needsRefresh = expiresAt !== undefined && expiresAt - Date.now() < REFRESH_SKEW_MS;

  if (!needsRefresh) return decrypt(record.accessToken);

  if (!record.refreshToken) {
    throw new CredentialsUnusableError(
      `Access token for user ${userId} expired and no refresh token is stored`,
    );
  }
  if (record.refreshTokenExpiresAt && record.refreshTokenExpiresAt.getTime() < Date.now()) {
    throw new CredentialsUnusableError(
      `Refresh token for user ${userId} expired; the user must re-authorise`,
    );
  }

  log.info("refreshing github user token", { userId });
  const refreshed = await refreshUserTokens(decrypt(record.refreshToken));
  await persistTokens(userId, refreshed);
  return refreshed.accessToken;
}

export async function getUserWithApiBase(userId: string) {
  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new CredentialsUnusableError(`No user ${userId}`);
  return user;
}
