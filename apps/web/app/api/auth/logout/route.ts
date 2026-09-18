import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(appBaseUrl(), { status: 303 });
}
