import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  installations,
  pullRequestAssignees,
  pullRequestInvolvement,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncRuns,
  userInstallations,
  userRepositoryAccess,
  users,
  type ChecksState,
  type MergeableState,
  type ReviewDecision,
} from "../db/schema.ts";
import { createInstallationClient } from "../github/app.ts";
import type { RateLimitSnapshot } from "../github/client.ts";
import {
  fetchOpenPullRequests,
  listInstallationRepositories,
  type InstallationRepository,
} from "../github/repo-queries.ts";
import type { PullRequestNode } from "../github/pull-request-fields.ts";
import { log, timed } from "../lib/logger.ts";
import { recomputeInvolvement } from "./involvement.ts";

export const INSTALLATION_SYNC_KIND = "installation_pull_requests";

export interface InstallationSyncOutcome {
  syncRunId: string;
  repositoryCount: number;
  pullRequestCount: number;
  involvementCount: number;
  rateLimit?: RateLimitSnapshot;
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

/**
 * Null when there is no CI, and also when the installation may not read the
 * head commit — both mean "no verdict available", which the triage rules
 * already treat as not-failing.
 */
function checksStateOf(node: PullRequestNode): ChecksState | null {
  return node.commits?.nodes[0]?.commit?.statusCheckRollup?.state ?? null;
}

/**
 * Fetches every open pull request in one installation and rebuilds the cache
 * for it.
 *
 * This is the primary data path. The app itself is the query point: one sync
 * per installation serves every ghspace user in that account, rather than each
 * of them spending their own rate limit asking a near-identical question. It
 * also runs with nobody signed in, which is what makes scheduled refreshes —
 * and, later, webhooks — possible at all.
 *
 * Per-user filtering happens at read time against `user_repository_access`.
 * Nothing here is user-scoped, and nothing here may be served to a user without
 * that filter.
 */
export async function syncInstallation(
  installationRowId: string,
): Promise<InstallationSyncOutcome> {
  const startedAt = new Date();

  const [installation] = await db()
    .select()
    .from(installations)
    .where(eq(installations.id, installationRowId))
    .limit(1);
  if (!installation) throw new Error(`No installation ${installationRowId}`);

  const [run] = await db()
    .insert(syncRuns)
    .values({
      installationId: installation.id,
      kind: INSTALLATION_SYNC_KIND,
      status: "running",
      startedAt,
    })
    .returning({ id: syncRuns.id });
  const syncRunId = run!.id;

  try {
    if (installation.suspendedAt) {
      // A suspended installation cannot mint a token. Leave the cached data in
      // place and record why the run did nothing.
      throw new Error("Installation is suspended");
    }

    const client = createInstallationClient(installation.githubInstallationId);
    const account = installation.accountLogin;

    const repos = await timed("listing repositories", { account }, () =>
      listInstallationRepositories(client),
    );
    const active = repos.filter((repo) => !repo.isArchived);
    log.info("repositories to scan", {
      account,
      total: repos.length,
      active: active.length,
      archived: repos.length - active.length,
    });

    const { pullRequests: nodes, rateLimit } = await fetchOpenPullRequests(
      client,
      active.map((r) => ({ owner: r.owner, name: r.name })),
      (done, total, found) =>
        log.info("scanning repositories", {
          account,
          progress: `${done}/${total}`,
          pullRequests: found,
        }),
    );

    const involvementCount = await timed(
      "writing snapshot",
      { account, pullRequests: nodes.length },
      () => writeSnapshot(installation.id, repos, nodes, startedAt),
    );

    await db()
      .update(syncRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        itemsSynced: nodes.length,
        rateLimitCost: rateLimit?.cost,
        rateLimitRemaining: rateLimit?.remaining,
        rateLimitResetAt: rateLimit?.resetAt,
      })
      .where(eq(syncRuns.id, syncRunId));

    log.info("installation sync succeeded", {
      account,
      repositories: active.length,
      pullRequests: nodes.length,
      involvementRows: involvementCount,
      rateLimitRemaining: rateLimit?.remaining,
      ms: Date.now() - startedAt.getTime(),
    });

    return {
      syncRunId,
      repositoryCount: active.length,
      pullRequestCount: nodes.length,
      involvementCount,
      rateLimit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db()
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(syncRuns.id, syncRunId));
    log.error("installation sync failed", {
      installation: installation.accountLogin,
      error: message,
    });
    throw error;
  }
}

/**
 * Replaces this installation's cached state in one transaction.
 *
 * Atomicity matters more here than it did for per-user syncs: a partial write
 * would leave one organisation's pull requests half-refreshed for *every*
 * ghspace user who can see them.
 */
async function writeSnapshot(
  installationId: string,
  repos: InstallationRepository[],
  nodes: PullRequestNode[],
  startedAt: Date,
): Promise<number> {
  return db().transaction(async (tx) => {
    // --- repositories -----------------------------------------------------
    const repoIdByNodeId = new Map<string, string>();
    if (repos.length > 0) {
      const rows = await tx
        .insert(repositories)
        .values(
          repos.map((repo) => ({
            nodeId: repo.nodeId,
            owner: repo.owner,
            name: repo.name,
            nameWithOwner: repo.nameWithOwner,
            isPrivate: repo.isPrivate,
            isArchived: repo.isArchived,
            url: repo.url,
            installationId,
            syncedAt: startedAt,
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
            installationId: sqlExcluded("installation_id"),
            syncedAt: startedAt,
          },
        })
        .returning({ id: repositories.id, nodeId: repositories.nodeId });
      for (const row of rows) repoIdByNodeId.set(row.nodeId, row.id);
    }

    // A repository removed from the installation stops being listed. Dropping
    // it cascades to its pull requests, which is how they leave every
    // dashboard at once.
    await tx
      .delete(repositories)
      .where(
        and(
          eq(repositories.installationId, installationId),
          lt(repositories.syncedAt, startedAt),
        ),
      );

    const ownedRepoIds = [...repoIdByNodeId.values()];
    if (ownedRepoIds.length === 0) return 0;

    // --- pull requests ----------------------------------------------------
    const prIdByNodeId = new Map<string, string>();
    if (nodes.length > 0) {
      const deduped = new Map<string, PullRequestNode>();
      for (const node of nodes) deduped.set(node.id, node);

      const values = [...deduped.values()]
        // A PR whose repository is not in this installation's listing has
        // nowhere to hang; skipping beats inserting an orphan.
        .filter((node) => repoIdByNodeId.has(node.repository.id))
        .map((node) => ({
          nodeId: node.id,
          repositoryId: repoIdByNodeId.get(node.repository.id)!,
          number: node.number,
          title: node.title,
          url: node.url,
          state: node.state,
          isDraft: node.isDraft,
          authorLogin: node.author?.login ?? null,
          authorAvatarUrl: node.author?.avatarUrl ?? null,
          additions: node.additions,
          deletions: node.deletions,
          changedFiles: node.changedFiles,
          commentCount: node.comments?.totalCount ?? 0,
          reviewDecision: (node.reviewDecision ?? null) as ReviewDecision | null,
          mergeable: (node.mergeable ?? null) as MergeableState | null,
          checksState: checksStateOf(node),
          createdAt: new Date(node.createdAt),
          updatedAt: new Date(node.updatedAt),
          mergedAt: node.mergedAt ? new Date(node.mergedAt) : null,
          closedAt: node.closedAt ? new Date(node.closedAt) : null,
          syncedAt: startedAt,
        }));

      const CHUNK = 250;
      for (let i = 0; i < values.length; i += CHUNK) {
        const rows = await tx
          .insert(pullRequests)
          .values(values.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: pullRequests.nodeId,
            set: {
              repositoryId: sqlExcluded("repository_id"),
              title: sqlExcluded("title"),
              state: sqlExcluded("state"),
              isDraft: sqlExcluded("is_draft"),
              authorLogin: sqlExcluded("author_login"),
              authorAvatarUrl: sqlExcluded("author_avatar_url"),
              additions: sqlExcluded("additions"),
              deletions: sqlExcluded("deletions"),
              changedFiles: sqlExcluded("changed_files"),
              commentCount: sqlExcluded("comment_count"),
              reviewDecision: sqlExcluded("review_decision"),
              mergeable: sqlExcluded("mergeable"),
              checksState: sqlExcluded("checks_state"),
              updatedAt: sqlExcluded("updated_at"),
              mergedAt: sqlExcluded("merged_at"),
              closedAt: sqlExcluded("closed_at"),
              syncedAt: startedAt,
            },
          })
          .returning({ id: pullRequests.id, nodeId: pullRequests.nodeId });
        for (const row of rows) prIdByNodeId.set(row.nodeId, row.id);
      }
    }

    // The fetch asked for open pull requests only, so anything in these
    // repositories that this run did not see has been merged or closed.
    await tx
      .delete(pullRequests)
      .where(
        and(
          inArray(pullRequests.repositoryId, ownedRepoIds),
          lt(pullRequests.syncedAt, startedAt),
        ),
      );

    const prIds = [...prIdByNodeId.values()];

    // --- reviews, review requests, assignees ------------------------------
    // GitHub returns each of these as a complete snapshot per PR, so replacing
    // them wholesale is the only way a withdrawn request actually disappears.
    if (prIds.length > 0) {
      await tx.delete(pullRequestReviews).where(inArray(pullRequestReviews.pullRequestId, prIds));
      await tx
        .delete(pullRequestReviewRequests)
        .where(inArray(pullRequestReviewRequests.pullRequestId, prIds));
      await tx
        .delete(pullRequestAssignees)
        .where(inArray(pullRequestAssignees.pullRequestId, prIds));

      const seen = new Map<string, PullRequestNode>();
      for (const node of nodes) seen.set(node.id, node);
      const present = [...seen.values()].filter((node) => prIdByNodeId.has(node.id));

      const reviewRows = present.flatMap((node) =>
        (node.latestReviews?.nodes ?? []).map((review) => ({
          nodeId: review.id,
          pullRequestId: prIdByNodeId.get(node.id)!,
          reviewerLogin: review.author?.login ?? null,
          reviewerAvatarUrl: review.author?.avatarUrl ?? null,
          state: review.state,
          submittedAt: review.submittedAt ? new Date(review.submittedAt) : null,
        })),
      );

      const requestRows = present.flatMap((node) =>
        (node.reviewRequests?.nodes ?? []).flatMap((request) => {
          const reviewer = request.requestedReviewer;
          const login = reviewer?.login ?? reviewer?.slug;
          if (!reviewer || !login) return [];
          return [
            {
              pullRequestId: prIdByNodeId.get(node.id)!,
              requestedLogin: login,
              isTeam: reviewer.__typename === "Team",
              avatarUrl: reviewer.avatarUrl ?? null,
            },
          ];
        }),
      );

      const assigneeRows = present.flatMap((node) =>
        (node.assignees?.nodes ?? []).map((assignee) => ({
          pullRequestId: prIdByNodeId.get(node.id)!,
          login: assignee.login,
          avatarUrl: assignee.avatarUrl ?? null,
        })),
      );

      // Chunked: Postgres caps a statement at 65535 bind parameters, and a
      // large organisation produces far more rows than that in one sweep.
      for (const chunk of chunks(reviewRows)) {
        await tx.insert(pullRequestReviews).values(chunk).onConflictDoNothing();
      }
      for (const chunk of chunks(requestRows)) {
        await tx.insert(pullRequestReviewRequests).values(chunk).onConflictDoNothing();
      }
      for (const chunk of chunks(assigneeRows)) {
        await tx.insert(pullRequestAssignees).values(chunk).onConflictDoNothing();
      }
    }

    // --- involvement ------------------------------------------------------
    // Only users who can actually reach at least one of these repositories.
    const reachable = await tx
      .selectDistinct({ id: users.id, githubLogin: users.githubLogin })
      .from(users)
      .innerJoin(userRepositoryAccess, eq(userRepositoryAccess.userId, users.id))
      .where(inArray(userRepositoryAccess.repositoryId, ownedRepoIds));

    const involvementCount = await recomputeInvolvement(
      tx,
      ownedRepoIds,
      reachable,
      startedAt,
    );

    // Involvement that this run did not reassert no longer holds — the PR was
    // merged, or the person was unassigned.
    if (reachable.length > 0) {
      await tx
        .delete(pullRequestInvolvement)
        .where(
          and(
            inArray(
              pullRequestInvolvement.userId,
              reachable.map((u) => u.id),
            ),
            inArray(
              pullRequestInvolvement.pullRequestId,
              prIds.length > 0 ? prIds : [""],
            ),
            lt(pullRequestInvolvement.lastSeenAt, startedAt),
          ),
        );
    }

    return involvementCount;
  });
}

const INSERT_CHUNK = 500;

function* chunks<T>(rows: T[]): Generator<T[]> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const slice = rows.slice(i, i + INSERT_CHUNK);
    if (slice.length > 0) yield slice;
  }
}

/** Every installation ghspace knows about, oldest sync first. */
export async function listInstallationsForSync(): Promise<
  { id: string; accountLogin: string }[]
> {
  return db()
    .select({ id: installations.id, accountLogin: installations.accountLogin })
    .from(installations)
    .innerJoin(userInstallations, eq(userInstallations.installationId, installations.id))
    .groupBy(installations.id, installations.accountLogin);
}
