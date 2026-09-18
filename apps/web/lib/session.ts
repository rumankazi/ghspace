import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appBaseUrl, isProduction, sessionSecret } from "./env.ts";

const COOKIE_NAME = "ghspace_session";

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sessions are a signed cookie rather than a database row: the only thing that
 * needs to survive is "which user is this", and a stateless cookie keeps every
 * page render down to the queries the page actually needs.
 */
function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);

  // Length check first: timingSafeEqual throws on a length mismatch.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction || appBaseUrl().startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Returns the signed-in user's id, or null. Never throws on a bad cookie. */
export async function getSessionUserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;

  if (!raw) return null;

  const separator = raw.lastIndexOf(".");

  if (separator <= 0) return null;

  const userId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  return verify(userId, signature) ? userId : null;
}
