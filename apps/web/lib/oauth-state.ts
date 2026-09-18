import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isProduction } from "./env.ts";

const STATE_COOKIE = "ghspace_oauth_state";

/**
 * CSRF protection for the OAuth round trip: the value handed to GitHub must
 * come back matching one this browser was issued, so a third party cannot
 * complete a sign-in on someone else's behalf.
 */
export async function issueState(): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 10 * 60,
  });
  return state;
}

export async function consumeState(received: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
