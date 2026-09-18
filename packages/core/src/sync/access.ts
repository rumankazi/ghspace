import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  installations,
  repositories,
  syncRuns,
  userInstallations,
  userRepositoryAccess,
} from "../db/schema.ts";
import { createGitHubClient } from "../github/client.ts";
import { fetchUserInstallations } from "../github/installations.ts";
import { listAccessibleRepositories } from "../github/user-repos.ts";
import { log, timed } from "../lib/logger.ts";
import { getUserWithApiBase, getValidAccessToken } from "./tokens.ts";

export const ACCESS_SYNC_KIND = "user_access";

function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

export interface AccessSyncOutcome {
  installationCount: number;
  repositoryCount: number;
}

/**
 * Refreshes what one user is allowed to see.
 *
 * This is the only part of the sync that still needs the user's own token, and
 * it is not an optimisation — it is the access-control boundary. Pull requests
 * are fetched with an installation token that can read every repository in the
 * account, so without this list there would be nothing stopping one user's
 * dashboard from showing another team's private work.
 *
 * It runs on its own schedule, far less often than the pull request sync:
 * repository membership changes rarely, and each run costs that user's personal
 * rate limit rather than the installation's.
 */
export async function syncUserAccess(userId: string): Promise<AccessSyncOutcome> {
  const seenAt = new Date();
  const user = await getUserWithApiBase(userId);

  const [run] = await db()
    .insert(syncRuns)
    .values({ userId, kind: ACCESS_SYNC_KIND, status: "running", startedAt: seenAt })
    .returning({ id: syncRuns.id });

  const syncRunId = run!.id;

  try {
    const token = await getValidAccessToken(userId);

    const client = createGitHubClient({
      token,
      apiBaseUrl: user.apiBaseUrl,
      userLogin: user.githubLogin,
    });

    const found = await timed("listing installations", { login: user.githubLogin }, () =>
      fetchUserInstallations(client),
    );

    let repositoryCount = 0;

    for (const [index, entry] of found.entries()) {
      const accessible = await timed(
        "listing accessible repositories",
        { account: entry.accountLogin, installation: `${index + 1}/${found.length}` },
        () => listAccessibleRepositories(client, entry.githubInstallationId),
      );

      repositoryCount += accessible.length;

      await db().transaction(async (tx) => {
        const installationValues = {
          accountLogin: entry.accountLogin,
          accountType: entry.accountType,
          accountAvatarUrl: entry.accountAvatarUrl,
          repositorySelection: entry.repositorySelection,
          htmlUrl: entry.htmlUrl,
          suspendedAt: entry.suspendedAt,
          syncedAt: seenAt,
        };

        const [installationRow] = await tx
          .insert(installations)
          .values({ githubInstallationId: entry.githubInstallationId, ...installationValues })
          .onConflictDoUpdate({
            target: installations.githubInstallationId,
            set: installationValues,
          })
          .returning({ id: installations.id });

        await tx
          .insert(userInstallations)
          .values({
            userId,
            installationId: installationRow!.id,
            repositoryCount: accessible.length,
            lastSeenAt: seenAt,
          })
          .onConflictDoUpdate({
            target: [userInstallations.userId, userInstallations.installationId],
            set: { repositoryCount: accessible.length, lastSeenAt: seenAt },
          });

        if (accessible.length === 0) return;

        // Repositories are upserted here as well as in the installation sync,
        // because whichever of the two runs first has to be able to create the
        // row the access record points at. `installationId` is deliberately not
        // set from this path — the installation sync owns that column.
        const repoRows = await tx
          .insert(repositories)
          .values(
            accessible.map((repo) => ({
              nodeId: repo.nodeId,
              owner: repo.owner,
              name: repo.name,
              nameWithOwner: repo.nameWithOwner,
              isPrivate: repo.isPrivate,
              isArchived: repo.isArchived,
              url: repo.url,
              syncedAt: seenAt,
            })),
          )
          .onConflictDoUpdate({
            target: repositories.nodeId,
            set: {
              owner: sqlExcluded("owner"),
              name: sqlExcluded("name"),
              nameWithOwner: sqlExcluded("name_with_owner"),
              isPrivate: sqlExcluded("is_private"),
              isArchived: sqlExcluded("is_archived"),
              url: sqlExcluded("url"),
            },
          })
          .returning({ id: repositories.id });

        await tx
          .insert(userRepositoryAccess)
          .values(
            repoRows.map((row) => ({
              userId,
              repositoryId: row.id,
              lastSeenAt: seenAt,
            })),
          )
          .onConflictDoUpdate({
            target: [userRepositoryAccess.userId, userRepositoryAccess.repositoryId],
            set: { lastSeenAt: seenAt },
          });
      });
    }

    // Access that this run did not reassert has been revoked. Sweeping by
    // timestamp is what makes losing access take effect, so it must happen even
    // when the user has no installations left at all.
    await db()
      .delete(userRepositoryAccess)
      .where(
        and(eq(userRepositoryAccess.userId, userId), lt(userRepositoryAccess.lastSeenAt, seenAt)),
      );
    await db()
      .delete(userInstallations)
      .where(
        and(eq(userInstallations.userId, userId), lt(userInstallations.lastSeenAt, seenAt)),
      );

    await db()
      .update(syncRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        itemsSynced: repositoryCount,
      })
      .where(eq(syncRuns.id, syncRunId));

    log.info("user access synced", {
      login: user.githubLogin,
      installations: found.length,
      repositories: repositoryCount,
    });

    return { installationCount: found.length, repositoryCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db()
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(syncRuns.id, syncRunId));
    log.error("user access sync failed", { userId, error: message });
    throw error;
  }
}
