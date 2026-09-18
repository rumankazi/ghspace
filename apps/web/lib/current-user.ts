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
  // A valid cookie for a deleted user: clear the session rather than loop.
  if (!user) redirect("/api/auth/logout");

  return user;
}
