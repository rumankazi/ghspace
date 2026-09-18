import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, users } from "@ghspace/core/db";
import { log } from "@ghspace/core";
import { appBaseUrl, devLoginEnabled } from "@/lib/env";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Signs in as the first seeded user, so the interface can be looked at without
 * a GitHub App.
 *
 * Gated twice over: it is unreachable unless `ALLOW_DEV_LOGIN=1` *and*
 * `NODE_ENV` is not "production". One flag alone would be a single typo away
 * from an open sign-in endpoint on a deployed instance.
 */
export async function POST() {
  if (!devLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [user] = await db()
    .select({ id: users.id, login: users.githubLogin })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      `${appBaseUrl()}/?error=${encodeURIComponent(
        "No seeded user found. Run: bun run seed",
      )}`,
      { status: 303 },
    );
  }

  await createSession(user.id);
  log.warn("development sign-in used", { login: user.login });

  return NextResponse.redirect(`${appBaseUrl()}/dashboard`, { status: 303 });
}
