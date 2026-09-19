import { and, asc, desc, eq, exists, ilike, inArray, sql } from "drizzle-orm";
import { db } from "./db/client.ts";
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
  type SyncStatus,
  type TriageBucket,
} from "./db/schema.ts";
import {
  BUCKET_DESCRIPTIONS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  COLLAPSED_BY_DEFAULT,
} from "./sync/buckets.ts";
import { INSTALLATION_SYNC_KIND } from "./sync/installation-sync.ts";

export interface DashboardPullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  repository: { id: string; nameWithOwner: string; owner: string; isPrivate: boolean };
  author: { login: string | null; avatarUrl: string | null };
  additions: number;
  deletions: number;
  changedFiles: number;
  commentCount: number;
  reviewDecision: string | null;
  mergeable: string | null;
  checksState: string | null;
  updatedAt: Date;
  reviewers: { login: string; avatarUrl: string | null; state: string }[];
  pendingReviewers: { login: string; avatarUrl: string | null; isTeam: boolean }[];
  assignees: { login: string; avatarUrl: string | null }[];
  /** Null in the browse view, where a pull request need not involve the viewer. */
  reason: {
    isAuthor: boolean;
    isReviewRequested: boolean;
    isAssigned: boolean;
    isMentioned: boolean;
    hasReviewed: boolean;
  } | null;
}

/**
 * Restricts a query to repositories this user may see.
 *
 * Pull requests are cached from an *installation* token, which reads every
 * repository in the account — including ones this user has no access to. This
 * predicate is the boundary that keeps them apart, so every public read path in
 * this module composes it. Forgetting it leaks private repositories between
 * users of the same organisation.
 */
function visibleToUser(userId: string) {
  return exists(
    db()
      .select({ one: sql`1` })
      .from(userRepositoryAccess)
      .where(
        and(
          eq(userRepositoryAccess.userId, userId),
          eq(userRepositoryAccess.repositoryId, pullRequests.repositoryId),
        ),
      ),
  );
}

/** A pull request that will not merge as it stands. */
function needsAttention(pr: DashboardPullRequest): boolean {
  return (
    pr.checksState === "FAILURE" ||
    pr.checksState === "ERROR" ||
    pr.mergeable === "CONFLICTING"
  );
}

interface PullRequestRow {
  pr: typeof pullRequests.$inferSelect;
  repo: typeof repositories.$inferSelect;
}

/** Loads reviews, pending reviewers and assignees for a page of pull requests. */
async function loadRelated(prIds: string[]) {
  if (prIds.length === 0) {
    return { reviews: [], requests: [], assignees: [] };
  }

  const [reviews, requests, assignees] = await Promise.all([
    db().select().from(pullRequestReviews).where(inArray(pullRequestReviews.pullRequestId, prIds)),
    db()
      .select()
      .from(pullRequestReviewRequests)
      .where(inArray(pullRequestReviewRequests.pullRequestId, prIds)),
    db()
      .select()
      .from(pullRequestAssignees)
      .where(inArray(pullRequestAssignees.pullRequestId, prIds)),
  ]);

  return { reviews, requests, assignees };
}

function assemble(
  rows: PullRequestRow[],
  related: Awaited<ReturnType<typeof loadRelated>>,
  reasons: Map<string, DashboardPullRequest["reason"]>,
): DashboardPullRequest[] {
  const group = <T>(items: T[], key: (item: T) => string) => {
    const map = new Map<string, T[]>();

    for (const item of items) {
      const existing = map.get(key(item));

      if (existing) existing.push(item);
      else map.set(key(item), [item]);
    }

    return map;
  };

  const reviewsBy = group(related.reviews, (r) => r.pullRequestId);
  const requestsBy = group(related.requests, (r) => r.pullRequestId);
  const assigneesBy = group(related.assignees, (a) => a.pullRequestId);

  return rows.map(({ pr, repo }) => ({
    id: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    repository: {
      id: repo.id,
      nameWithOwner: repo.nameWithOwner,
      owner: repo.owner,
      isPrivate: repo.isPrivate,
    },
    author: { login: pr.authorLogin, avatarUrl: pr.authorAvatarUrl },
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    commentCount: pr.commentCount,
    reviewDecision: pr.reviewDecision,
    mergeable: pr.mergeable,
    checksState: pr.checksState,
    updatedAt: pr.updatedAt,
    reviewers: (reviewsBy.get(pr.id) ?? [])
      .filter((r) => r.reviewerLogin !== null)
      .map((r) => ({ login: r.reviewerLogin!, avatarUrl: r.reviewerAvatarUrl, state: r.state })),
    pendingReviewers: (requestsBy.get(pr.id) ?? []).map((r) => ({
      login: r.requestedLogin,
      avatarUrl: r.avatarUrl,
      isTeam: r.isTeam,
    })),
    assignees: (assigneesBy.get(pr.id) ?? []).map((a) => ({
      login: a.login,
      avatarUrl: a.avatarUrl,
    })),
    reason: reasons.get(pr.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Triage view
// ---------------------------------------------------------------------------

export interface DashboardBucket {
  key: TriageBucket;
  label: string;
  description: string;
  pullRequests: DashboardPullRequest[];
  /** Routinely large and low-stakes; the UI opens these closed. */
  collapsed: boolean;
  /** Failing checks or a merge conflict — worth surfacing on a closed bucket. */
  needsAttentionCount: number;
}

export interface SyncState {
  status: SyncStatus | "never";
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  error: string | null;
  rateLimitRemaining: number | null;
  /** The ceiling `rateLimitRemaining` counts down from; null on runs recorded
   *  before the limit was persisted, which the UI shows without a meter. */
  rateLimitLimit: number | null;
  rateLimitResetAt: Date | null;
}

export interface Dashboard {
  buckets: DashboardBucket[];
  total: number;
  sync: SyncState;
}

/**
 * The triage view: only pull requests that involve this user, grouped by what
 * they should do about them.
 *
 * Reads nothing but Postgres, so a rate-limited or unreachable GitHub degrades
 * to slightly stale data rather than a broken page.
 */
export async function getDashboard(userId: string): Promise<Dashboard> {
  const [rows, sync] = await Promise.all([
    db()
      .select({
        pr: pullRequests,
        repo: repositories,
        involvement: pullRequestInvolvement,
      })
      .from(pullRequestInvolvement)
      .innerJoin(pullRequests, eq(pullRequestInvolvement.pullRequestId, pullRequests.id))
      .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
      .where(and(eq(pullRequestInvolvement.userId, userId), visibleToUser(userId)))
      .orderBy(desc(pullRequests.updatedAt)),
    getSyncState(userId),
  ]);

  const related = await loadRelated(rows.map((r) => r.pr.id));

  const reasons = new Map<string, DashboardPullRequest["reason"]>(
    rows.map((r) => [
      r.pr.id,
      {
        isAuthor: r.involvement.isAuthor,
        isReviewRequested: r.involvement.isReviewRequested,
        isAssigned: r.involvement.isAssigned,
        isMentioned: r.involvement.isMentioned,
        hasReviewed: r.involvement.hasReviewed,
      },
    ]),
  );

  const assembled = assemble(rows, related, reasons);
  const bucketByPr = new Map(rows.map((r) => [r.pr.id, r.involvement.bucket]));

  const byBucket = new Map<TriageBucket, DashboardPullRequest[]>();

  for (const pr of assembled) {
    const bucket = bucketByPr.get(pr.id);

    if (!bucket) continue;
    const list = byBucket.get(bucket);

    if (list) list.push(pr);
    else byBucket.set(bucket, [pr]);
  }

  const buckets = BUCKET_ORDER.map((key) => {
    const contents = byBucket.get(key) ?? [];

    // Unhealthy first inside a bucket that opens collapsed: a bump with failing
    // checks must not be able to hide behind thirty green ones.
    const ordered = COLLAPSED_BY_DEFAULT.includes(key)
      ? [...contents].sort(
          (a, b) =>
            Number(needsAttention(b)) - Number(needsAttention(a)) ||
            b.updatedAt.getTime() - a.updatedAt.getTime(),
        )
      : contents;

    return {
      key,
      label: BUCKET_LABELS[key],
      description: BUCKET_DESCRIPTIONS[key],
      pullRequests: ordered,
      collapsed: COLLAPSED_BY_DEFAULT.includes(key),
      needsAttentionCount: contents.filter(needsAttention).length,
    };
  });

  return { buckets, total: assembled.length, sync };
}

// ---------------------------------------------------------------------------
// Browse view
// ---------------------------------------------------------------------------

export interface PullRequestFilters {
  /** Repository ids to restrict to. Empty or absent means all accessible ones. */
  repositoryIds?: string[];
  authors?: string[];
  /** Matches the title, case-insensitively. */
  query?: string;
  /** "involved" narrows to pull requests that involve the viewer. */
  scope?: "all" | "involved";
  draft?: "include" | "exclude" | "only";
  limit?: number;
  offset?: number;
}

export interface RepositoryGroup {
  repository: DashboardPullRequest["repository"];
  pullRequests: DashboardPullRequest[];
}

export interface PullRequestPage {
  /** This page's pull requests, grouped by the repository they belong to. */
  groups: RepositoryGroup[];
  /** How many pull requests this page holds, across all of its groups. */
  count: number;
  /** How many match the filters in total, across every page. */
  total: number;
  hasMore: boolean;
}

/**
 * Collapses an already repository-ordered list into one group per repository.
 *
 * Runs off adjacency rather than a map keyed by repository, so a list that is
 * *not* ordered by repository degrades into several groups for the same
 * repository instead of silently reordering the page — the caller's ordering
 * stays the single source of truth for what the page shows.
 */
function groupByRepository(pullRequests: DashboardPullRequest[]): RepositoryGroup[] {
  const groups: RepositoryGroup[] = [];

  for (const pr of pullRequests) {
    const current = groups.at(-1);

    if (current && current.repository.id === pr.repository.id) current.pullRequests.push(pr);
    else groups.push({ repository: pr.repository, pullRequests: [pr] });
  }

  return groups;
}

/**
 * The browse view over every open pull request this user can see, grouped by
 * repository.
 *
 * Because the sync fetches repositories whole rather than asking GitHub about
 * one person, this data is already present — filtering is a local query, not
 * another API call.
 */
export async function getPullRequests(
  userId: string,
  filters: PullRequestFilters = {},
): Promise<PullRequestPage> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const conditions = [visibleToUser(userId)];

  if (filters.repositoryIds && filters.repositoryIds.length > 0) {
    conditions.push(inArray(pullRequests.repositoryId, filters.repositoryIds));
  }

  if (filters.authors && filters.authors.length > 0) {
    conditions.push(inArray(pullRequests.authorLogin, filters.authors));
  }

  if (filters.query && filters.query.trim().length > 0) {
    conditions.push(ilike(pullRequests.title, `%${filters.query.trim()}%`));
  }

  if (filters.draft === "exclude") conditions.push(eq(pullRequests.isDraft, false));

  if (filters.draft === "only") conditions.push(eq(pullRequests.isDraft, true));

  if (filters.scope === "involved") {
    conditions.push(
      exists(
        db()
          .select({ one: sql`1` })
          .from(pullRequestInvolvement)
          .where(
            and(
              eq(pullRequestInvolvement.userId, userId),
              eq(pullRequestInvolvement.pullRequestId, pullRequests.id),
            ),
          ),
      ),
    );
  }

  const where = and(...conditions);

  const [rows, [counted]] = await Promise.all([
    db()
      .select({ pr: pullRequests, repo: repositories })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
      .where(where)
      // Repository first, so a page is a run of whole repositories rather than
      // a slice through all of them: grouping the result is then just a matter
      // of adjacency, and paging never splits a repository into two sections on
      // the same screen. Freshness still orders the rows within a repository.
      .orderBy(asc(repositories.nameWithOwner), desc(pullRequests.updatedAt))
      .limit(limit)
      .offset(offset),
    db()
      .select({ value: sql<number>`count(*)::int` })
      .from(pullRequests)
      .where(where),
  ]);

  const related = await loadRelated(rows.map((r) => r.pr.id));

  // Involvement is looked up only for the rows on this page, so the browse view
  // can still show why a pull request concerns you without joining the whole
  // table.
  const reasons = new Map<string, DashboardPullRequest["reason"]>();

  if (rows.length > 0) {
    const involvement = await db()
      .select()
      .from(pullRequestInvolvement)
      .where(
        and(
          eq(pullRequestInvolvement.userId, userId),
          inArray(
            pullRequestInvolvement.pullRequestId,
            rows.map((r) => r.pr.id),
          ),
        ),
      );

    for (const row of involvement) {
      reasons.set(row.pullRequestId, {
        isAuthor: row.isAuthor,
        isReviewRequested: row.isReviewRequested,
        isAssigned: row.isAssigned,
        isMentioned: row.isMentioned,
        hasReviewed: row.hasReviewed,
      });
    }
  }

  const total = counted?.value ?? 0;

  return {
    groups: groupByRepository(assemble(rows, related, reasons)),
    count: rows.length,
    total,
    hasMore: offset + rows.length < total,
  };
}

export interface FilterOptions {
  repositories: { id: string; nameWithOwner: string; openCount: number }[];
  authors: { login: string; avatarUrl: string | null; openCount: number }[];
}

/** Populates the filter controls from what this user can actually see. */
export async function getFilterOptions(userId: string): Promise<FilterOptions> {
  const [repos, authors] = await Promise.all([
    db()
      .select({
        id: repositories.id,
        nameWithOwner: repositories.nameWithOwner,
        openCount: sql<number>`count(${pullRequests.id})::int`,
      })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
      .where(visibleToUser(userId))
      .groupBy(repositories.id, repositories.nameWithOwner)
      .orderBy(repositories.nameWithOwner),
    db()
      .select({
        login: pullRequests.authorLogin,
        avatarUrl: sql<string | null>`max(${pullRequests.authorAvatarUrl})`,
        openCount: sql<number>`count(*)::int`,
      })
      .from(pullRequests)
      .where(visibleToUser(userId))
      .groupBy(pullRequests.authorLogin)
      .orderBy(desc(sql`count(*)`)),
  ]);

  return {
    repositories: repos,
    authors: authors
      .filter((a): a is typeof a & { login: string } => a.login !== null)
      .map((a) => ({ login: a.login, avatarUrl: a.avatarUrl, openCount: a.openCount })),
  };
}

// ---------------------------------------------------------------------------
// Sync state and installation coverage
// ---------------------------------------------------------------------------

/**
 * How fresh the data on screen is.
 *
 * Freshness now comes from the *installation* syncs behind this user's
 * repositories rather than from a sync of their own, so the worst case across
 * their installations is what gets reported — a dashboard is only as current as
 * its most stale source.
 */
export async function getSyncState(userId: string): Promise<SyncState> {
  const runs = await db()
    .select({ run: syncRuns })
    .from(syncRuns)
    .innerJoin(userInstallations, eq(userInstallations.installationId, syncRuns.installationId))
    .where(and(eq(userInstallations.userId, userId), eq(syncRuns.kind, INSTALLATION_SYNC_KIND)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(50);

  if (runs.length === 0) {
    return {
      status: "never",
      lastAttemptAt: null,
      lastSuccessAt: null,
      error: null,
      rateLimitRemaining: null,
      rateLimitLimit: null,
      rateLimitResetAt: null,
    };
  }

  const latest = runs[0]!.run;
  const succeeded = runs.map((r) => r.run).filter((r) => r.status === "succeeded");

  // The oldest of the most recent successes per installation is the honest
  // "synced N ago": one stale installation makes the whole page stale.
  const latestPerInstallation = new Map<string, Date>();

  for (const run of succeeded) {
    if (!run.installationId || !run.finishedAt) continue;
    const seen = latestPerInstallation.get(run.installationId);

    if (!seen || seen < run.finishedAt) latestPerInstallation.set(run.installationId, run.finishedAt);
  }

  const oldestSuccess = [...latestPerInstallation.values()].sort(
    (a, b) => a.getTime() - b.getTime(),
  )[0];

  const withBudget = succeeded.find((r) => r.rateLimitRemaining !== null);

  return {
    status: latest.status,
    lastAttemptAt: latest.startedAt,
    lastSuccessAt: oldestSuccess ?? null,
    error: latest.status === "failed" ? latest.error : null,
    rateLimitRemaining: withBudget?.rateLimitRemaining ?? null,
    rateLimitLimit: withBudget?.rateLimitLimit ?? null,
    rateLimitResetAt: withBudget?.rateLimitResetAt ?? null,
  };
}

export interface InstallationCoverage {
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  repositoryCount: number;
  coversAllRepositories: boolean;
  isSuspended: boolean;
  manageUrl: string | null;
}

/**
 * Which accounts ghspace can see through for this user.
 *
 * A GitHub App only reaches accounts where it is installed, so a dashboard is
 * only ever as complete as this list. Surfacing it is what stops a missing
 * organisation from looking like a bug.
 */
export async function getInstallationCoverage(
  userId: string,
): Promise<InstallationCoverage[]> {
  const rows = await db()
    .select({
      accountLogin: installations.accountLogin,
      accountType: installations.accountType,
      accountAvatarUrl: installations.accountAvatarUrl,
      repositorySelection: installations.repositorySelection,
      suspendedAt: installations.suspendedAt,
      manageUrl: installations.htmlUrl,
      repositoryCount: userInstallations.repositoryCount,
    })
    .from(userInstallations)
    .innerJoin(installations, eq(userInstallations.installationId, installations.id))
    .where(eq(userInstallations.userId, userId));

  return rows
    .map((row) => ({
      accountLogin: row.accountLogin,
      accountType: row.accountType,
      accountAvatarUrl: row.accountAvatarUrl,
      repositoryCount: row.repositoryCount,
      coversAllRepositories: row.repositorySelection === "all",
      isSuspended: row.suspendedAt !== null,
      manageUrl: row.manageUrl,
    }))
    .sort((a, b) => a.accountLogin.localeCompare(b.accountLogin));
}
