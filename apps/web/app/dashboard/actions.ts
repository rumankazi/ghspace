"use server";

import { revalidatePath } from "next/cache";
import { listInstallationsForSync, syncInstallation, syncUserAccess } from "@ghspace/core/sync";
import { log } from "@ghspace/core";
import { getSessionUserId } from "@/lib/session";

/**
 * Manual refresh. The worker is the normal path — this exists so a brand new
 * account can populate its dashboard immediately instead of waiting out the
 * first poll interval.
 */
export async function refreshNow(): Promise<void> {
  const userId = await getSessionUserId();

  if (!userId) return;

  try {
    // Access first: involvement can only be derived for a user whose repository
    // access is already known.
    await syncUserAccess(userId);

    for (const installation of await listInstallationsForSync()) {
      await syncInstallation(installation.id);
    }
  } catch (error) {
    // The failure is already recorded on `sync_runs`, and the page reads that
    // to show the user what happened. Throwing here would replace a usable
    // stale dashboard with an error screen.
    log.warn("manual refresh failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/pulls");
}
