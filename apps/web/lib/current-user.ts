import "server-only";
import { eq } from "drizzle-orm";
import { db, users } from "@ghspace/core/db";
import { redirect } from "next/navigation";
import { getSessionUserId } from "./session.ts";

/**
 * Resolves the signed-in user, or leaves for the sign-in page.
 *
 * Returns the row rather than just the id because every authenticated page
 * needs the avatar and login for the nav, and this keeps that to one query.
 */
export async function requireUser() {
  const userId = await getSessionUserId();

  if (!userId) redirect("/");

  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1);

  // A correctly signed cookie for a user that no longer exists — most often
  // after a database reset. The cookie has to be cleared by a route handler,
  // since a Server Component cannot write one, and the reason is carried
  // through so the sign-in page can explain what happened.
  if (!user) redirect("/api/auth/logout?reason=stale");

  return user;
}
