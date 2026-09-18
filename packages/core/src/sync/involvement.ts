import { inArray, sql } from "drizzle-orm";
import type { Transaction } from "../db/client.ts";
import {
  pullRequestAssignees,
  pullRequestInvolvement,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  type ChecksState,
  type MergeableState,
  type ReviewDecision,
} from "../db/schema.ts";
import { classify } from "./buckets.ts";

export interface InvolvedUser {
  id: string;
  githubLogin: string;
}

/**
 * Derives each user's relationship to the pull requests in a set of
 * repositories, from data already cached locally.
 *
 * Under the installation-first design nobody asks GitHub "which PRs involve
 * me". The repo-wide sync fetches everything once, and involvement falls out of
 * fields we already hold: who opened it, who is assigned, whose review is
 * pending, who has already reviewed.
 *
 * Two signals cannot be derived this way, because GitHub only exposes them
 * through search qualifiers rather than on the pull request itself:
 *
 *   - **@-mentions and comments.** `involves:` matched these; nothing on the PR
 *     records them without reading every comment body.
 *   - **Team review requests.** A request addressed to a team the user belongs
 *     to appears here only as a team slug, so it is not matched below.
 *
 * `searchPullRequests` is the recovery path for both.
 */
export async function recomputeInvolvement(
  tx: Transaction,
  repositoryIds: string[],
  users: InvolvedUser[],
  seenAt: Date,
): Promise<number> {
  if (repositoryIds.length === 0 || users.length === 0) return 0;

  const prs = await tx
    .select()
    .from(pullRequests)
    .where(inArray(pullRequests.repositoryId, repositoryIds));
  if (prs.length === 0) return 0;

  // Owning the repository is itself an involvement signal — see the bot case
  // in `classify`. The owner login is compared against each user's own login.
  const repoRows = await tx
    .select({ id: repositories.id, owner: repositories.owner })
    .from(repositories)
    .where(inArray(repositories.id, repositoryIds));
  const ownerByRepo = new Map(repoRows.map((r) => [r.id, r.owner]));

  const prIds = prs.map((pr) => pr.id);

  // Sequential, not Promise.all. A transaction is pinned to a single
  // connection, so concurrent queries on `tx` cannot actually overlap — node-
  // postgres serialises them and warns, and pg@9 will reject them outright.
  // (Concurrency is fine against the pool, where each query gets its own
  // connection; it is specifically a transaction that cannot.)
  const reviews = await tx
    .select()
    .from(pullRequestReviews)
    .where(inArray(pullRequestReviews.pullRequestId, prIds));
  const requests = await tx
    .select()
    .from(pullRequestReviewRequests)
    .where(inArray(pullRequestReviewRequests.pullRequestId, prIds));
  const assignees = await tx
    .select()
    .from(pullRequestAssignees)
    .where(inArray(pullRequestAssignees.pullRequestId, prIds));

  const reviewersByPr = groupLogins(reviews, (r) => r.pullRequestId, (r) => r.reviewerLogin);
  const assigneesByPr = groupLogins(assignees, (a) => a.pullRequestId, (a) => a.login);
  // Team requests are excluded: matching them needs the user's team
  // memberships, which this path does not fetch.
  const requestedByPr = groupLogins(
    requests.filter((r) => !r.isTeam),
    (r) => r.pullRequestId,
    (r) => r.requestedLogin,
  );

  const rows: (typeof pullRequestInvolvement.$inferInsert)[] = [];

  for (const pr of prs) {
    for (const user of users) {
      const login = user.githubLogin;
      const isAuthor = pr.authorLogin === login;
      const isReviewRequested = requestedByPr.get(pr.id)?.has(login) ?? false;
      const isAssigned = assigneesByPr.get(pr.id)?.has(login) ?? false;
      const hasReviewed = reviewersByPr.get(pr.id)?.has(login) ?? false;
      const isRepositoryOwner = ownerByRepo.get(pr.repositoryId) === login;

      // No relationship means no row. The dashboard is a list of things that
      // involve you; every other PR in the repo belongs to the browse view.
      if (
        !isAuthor &&
        !isReviewRequested &&
        !isAssigned &&
        !hasReviewed &&
        !isRepositoryOwner
      ) {
        continue;
      }

      rows.push({
        userId: user.id,
        pullRequestId: pr.id,
        isAuthor,
        isReviewRequested,
        isAssigned,
        // Only the search-based recovery path can populate this.
        isMentioned: false,
        hasReviewed,
        isRepositoryOwner,
        bucket: classify({
          isAuthor,
          isReviewRequested,
          isAssigned,
          isRepositoryOwner,
          authorIsBot: pr.authorIsBot,
          isDraft: pr.isDraft,
          state: pr.state,
          reviewDecision: pr.reviewDecision as ReviewDecision | null,
          checksState: pr.checksState as ChecksState | null,
          mergeable: pr.mergeable as MergeableState | null,
        }),
        lastSeenAt: seenAt,
      });
    }
  }

  if (rows.length === 0) return 0;

  // Chunked because a large organisation can produce tens of thousands of rows,
  // and Postgres caps a statement at 65535 bind parameters.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx
      .insert(pullRequestInvolvement)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [pullRequestInvolvement.userId, pullRequestInvolvement.pullRequestId],
        set: {
          isAuthor: sqlExcluded("is_author"),
          isReviewRequested: sqlExcluded("is_review_requested"),
          isAssigned: sqlExcluded("is_assigned"),
          isMentioned: sqlExcluded("is_mentioned"),
          hasReviewed: sqlExcluded("has_reviewed"),
          isRepositoryOwner: sqlExcluded("is_repository_owner"),
          bucket: sqlExcluded("bucket"),
          lastSeenAt: seenAt,
        },
      });
  }

  return rows.length;
}

function groupLogins<T>(
  items: T[],
  keyOf: (item: T) => string,
  loginOf: (item: T) => string | null,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const login = loginOf(item);
    if (!login) continue;
    const key = keyOf(item);
    const existing = map.get(key);
    if (existing) existing.add(login);
    else map.set(key, new Set([login]));
  }
  return map;
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
