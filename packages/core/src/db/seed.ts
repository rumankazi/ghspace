import { eq } from "drizzle-orm";
import { closeDb, db } from "./client.ts";
import {
  installations,
  pullRequestAssignees,
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
  type PullRequestState,
  type ReviewDecision,
} from "./schema.ts";
import { classify } from "../sync/buckets.ts";
import { pullRequestInvolvement } from "./schema.ts";

/**
 * Fills the database with plausible data so the interface can be looked at
 * without a GitHub App, credentials, or network access.
 *
 * Deliberately writes through the same tables the real sync writes, so the
 * dashboard exercises its actual read path rather than a mock. Everything here
 * is derived from a fixed seed — running it twice produces the same result.
 *
 *   bun run seed            # user "demo-user"
 *   bun run seed <login>    # pretend to be someone else
 */

const LOGIN = process.argv[2] ?? "demo-user";

/** Deterministic pseudo-random, so repeated runs produce identical data. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}
const random = makeRandom(20260918);

/**
 * Timestamps are relative to the real clock, not a fixed date: the interface
 * shows "updated 2 hours ago", and a pinned date would drift into reading
 * "in 3 hours" the moment it fell behind. Everything else stays deterministic.
 */
const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

const PEOPLE = [
  "priya-n",
  "marcus-t",
  "wen-li",
  "adaeze-o",
  "sam-quinn",
  "tobias-r",
] as const;

const REPOS = [
  { name: "platform-api", private: true },
  { name: "web-client", private: true },
  { name: "design-system", private: false },
  { name: "infra-terraform", private: true },
] as const;

const avatar = (login: string) =>
  `https://avatars.githubusercontent.com/u/${(login.length * 7919) % 90000}?v=4`;

interface SeedPr {
  repo: string;
  title: string;
  /** Defaults to a rotating cast member; set to LOGIN for the viewer's own work. */
  author?: string;
  isDraft?: boolean;
  state?: PullRequestState;
  reviewDecision?: ReviewDecision | null;
  checksState?: ChecksState | null;
  mergeable?: MergeableState;
  /** Logins with a *pending* review request. */
  requested?: string[];
  /** Logins who have already submitted a review, with its state. */
  reviewed?: { login: string; state: string }[];
  assignees?: string[];
  updatedHoursAgo: number;
  additions: number;
  deletions: number;
  comments?: number;
}

/**
 * Chosen to populate every bucket, including the awkward cases — approved but
 * still running, approved but conflicting, a draft of someone else's — so the
 * interface can be judged on realistic rather than flattering data.
 */
const SEED_PRS: SeedPr[] = [
  // --- blocked on you -----------------------------------------------------
  {
    repo: "platform-api",
    title: "Add cursor pagination to the events endpoint",
    author: "priya-n",
    requested: [LOGIN, "marcus-t"],
    checksState: "SUCCESS",
    updatedHoursAgo: 2,
    additions: 340,
    deletions: 88,
    comments: 4,
  },
  {
    repo: "web-client",
    title: "Replace the settings modal with a route",
    author: "wen-li",
    requested: [LOGIN],
    checksState: "PENDING",
    updatedHoursAgo: 6,
    additions: 612,
    deletions: 430,
    comments: 11,
  },
  {
    repo: "design-system",
    title: "Tokenise elevation and shadow scales",
    author: "adaeze-o",
    requested: [LOGIN],
    checksState: "SUCCESS",
    updatedHoursAgo: 27,
    additions: 95,
    deletions: 12,
  },

  // --- needs your action --------------------------------------------------
  {
    repo: "platform-api",
    title: "Retry webhook deliveries with exponential backoff",
    author: LOGIN,
    reviewDecision: "CHANGES_REQUESTED",
    reviewed: [
      { login: "marcus-t", state: "CHANGES_REQUESTED" },
      { login: "priya-n", state: "COMMENTED" },
    ],
    checksState: "SUCCESS",
    updatedHoursAgo: 4,
    additions: 208,
    deletions: 31,
    comments: 9,
  },
  {
    repo: "infra-terraform",
    title: "Pin provider versions and enable state locking",
    author: LOGIN,
    checksState: "FAILURE",
    reviewDecision: "REVIEW_REQUIRED",
    requested: ["tobias-r"],
    updatedHoursAgo: 9,
    additions: 76,
    deletions: 76,
    comments: 2,
  },
  {
    repo: "web-client",
    title: "Extract the table component out of the reports page",
    author: LOGIN,
    reviewDecision: "APPROVED",
    reviewed: [{ login: "wen-li", state: "APPROVED" }],
    checksState: "SUCCESS",
    mergeable: "CONFLICTING",
    updatedHoursAgo: 52,
    additions: 447,
    deletions: 398,
    comments: 6,
  },

  // --- ready to merge -----------------------------------------------------
  {
    repo: "design-system",
    title: "Ship the compact density variant for data tables",
    author: LOGIN,
    reviewDecision: "APPROVED",
    reviewed: [
      { login: "adaeze-o", state: "APPROVED" },
      { login: "wen-li", state: "APPROVED" },
    ],
    checksState: "SUCCESS",
    updatedHoursAgo: 1,
    additions: 129,
    deletions: 24,
    comments: 3,
  },
  {
    repo: "platform-api",
    title: "Drop the deprecated /v1/sessions handler",
    author: LOGIN,
    reviewDecision: "APPROVED",
    reviewed: [{ login: "priya-n", state: "APPROVED" }],
    checksState: "SUCCESS",
    updatedHoursAgo: 20,
    additions: 8,
    deletions: 214,
  },

  // --- blocked on others --------------------------------------------------
  {
    repo: "web-client",
    title: "Virtualise the notification list",
    author: LOGIN,
    reviewDecision: "REVIEW_REQUIRED",
    requested: ["wen-li", "adaeze-o"],
    checksState: "SUCCESS",
    updatedHoursAgo: 14,
    additions: 289,
    deletions: 61,
    comments: 1,
  },
  {
    repo: "platform-api",
    title: "Add request tracing to the ingestion worker",
    author: LOGIN,
    requested: ["marcus-t"],
    checksState: "PENDING",
    updatedHoursAgo: 30,
    additions: 156,
    deletions: 18,
  },
  {
    repo: "infra-terraform",
    title: "Move staging into its own account",
    author: LOGIN,
    reviewDecision: "APPROVED",
    checksState: "PENDING",
    reviewed: [{ login: "tobias-r", state: "APPROVED" }],
    updatedHoursAgo: 73,
    additions: 902,
    deletions: 140,
    comments: 17,
  },

  // --- drafts -------------------------------------------------------------
  {
    repo: "platform-api",
    title: "Spike: replace the job queue with pg-boss",
    author: LOGIN,
    isDraft: true,
    checksState: "FAILURE",
    updatedHoursAgo: 40,
    additions: 512,
    deletions: 233,
  },
  {
    repo: "design-system",
    title: "Prototype the new focus ring treatment",
    author: LOGIN,
    isDraft: true,
    updatedHoursAgo: 120,
    additions: 44,
    deletions: 9,
  },

  // --- already reviewed: watching, unless also assigned ---------------------
  {
    repo: "web-client",
    title: "Adopt the shared error boundary",
    author: "marcus-t",
    reviewed: [{ login: LOGIN, state: "APPROVED" }],
    reviewDecision: "APPROVED",
    checksState: "SUCCESS",
    updatedHoursAgo: 8,
    additions: 73,
    deletions: 40,
    comments: 5,
  },
  {
    repo: "platform-api",
    title: "Backfill missing tenant ids",
    author: "priya-n",
    reviewed: [{ login: LOGIN, state: "COMMENTED" }],
    assignees: [LOGIN],
    checksState: "SUCCESS",
    updatedHoursAgo: 36,
    additions: 61,
    deletions: 3,
    comments: 8,
  },

  // --- not involved: only visible in the browse view ----------------------
  {
    repo: "design-system",
    title: "Bump storybook to 9",
    author: "adaeze-o",
    checksState: "SUCCESS",
    requested: ["wen-li"],
    updatedHoursAgo: 5,
    additions: 1204,
    deletions: 980,
  },
  {
    repo: "web-client",
    title: "Fix the locale fallback for pt-BR",
    author: "sam-quinn",
    checksState: "FAILURE",
    updatedHoursAgo: 11,
    additions: 18,
    deletions: 4,
    comments: 2,
  },
  {
    repo: "infra-terraform",
    title: "Rotate the CI deploy key",
    author: "tobias-r",
    checksState: "SUCCESS",
    reviewDecision: "APPROVED",
    reviewed: [{ login: "marcus-t", state: "APPROVED" }],
    updatedHoursAgo: 19,
    additions: 6,
    deletions: 6,
  },
  {
    repo: "platform-api",
    title: "Document the rate limit headers",
    author: "wen-li",
    isDraft: true,
    updatedHoursAgo: 60,
    additions: 210,
    deletions: 0,
  },
  {
    repo: "design-system",
    title: "Add motion-reduce variants to every transition",
    author: "sam-quinn",
    checksState: "PENDING",
    requested: ["adaeze-o", "marcus-t"],
    updatedHoursAgo: 45,
    additions: 332,
    deletions: 118,
    comments: 3,
  },
];

async function seed(): Promise<void> {
  const seededAt = new Date(NOW - 4 * 60_000);

  // --- the viewer -------------------------------------------------------
  const profile = {
    githubLogin: LOGIN,
    name: "Demo User",
    email: null,
    avatarUrl: avatar(LOGIN),
    updatedAt: seededAt,
  };
  const [user] = await db()
    .insert(users)
    .values({ githubUserId: 900_001, ...profile })
    .onConflictDoUpdate({ target: users.githubUserId, set: profile })
    .returning({ id: users.id });
  const userId = user!.id;

  // --- installation -----------------------------------------------------
  const installationValues = {
    accountLogin: "acme-industries",
    accountType: "Organization",
    accountAvatarUrl: avatar("acme-industries"),
    repositorySelection: "all",
    htmlUrl: "https://github.com/organizations/acme-industries/settings/installations/900002",
    suspendedAt: null,
    syncedAt: seededAt,
  };
  const [installation] = await db()
    .insert(installations)
    .values({ githubInstallationId: 900_002, ...installationValues })
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: installationValues,
    })
    .returning({ id: installations.id });
  const installationId = installation!.id;

  await db()
    .insert(userInstallations)
    .values({
      userId,
      installationId,
      repositoryCount: REPOS.length,
      lastSeenAt: seededAt,
    })
    .onConflictDoUpdate({
      target: [userInstallations.userId, userInstallations.installationId],
      set: { repositoryCount: REPOS.length, lastSeenAt: seededAt },
    });

  // --- repositories, and this user's access to them ---------------------
  const repoIdByName = new Map<string, string>();
  for (const repo of REPOS) {
    const values = {
      owner: "acme-industries",
      name: repo.name,
      nameWithOwner: `acme-industries/${repo.name}`,
      isPrivate: repo.private,
      isArchived: false,
      url: `https://github.com/acme-industries/${repo.name}`,
      installationId,
      syncedAt: seededAt,
    };
    const [row] = await db()
      .insert(repositories)
      .values({ nodeId: `seed-repo-${repo.name}`, ...values })
      .onConflictDoUpdate({ target: repositories.nodeId, set: values })
      .returning({ id: repositories.id });
    repoIdByName.set(repo.name, row!.id);

    await db()
      .insert(userRepositoryAccess)
      .values({ userId, repositoryId: row!.id, lastSeenAt: seededAt })
      .onConflictDoUpdate({
        target: [userRepositoryAccess.userId, userRepositoryAccess.repositoryId],
        set: { lastSeenAt: seededAt },
      });
  }

  // --- pull requests ----------------------------------------------------
  let number = 100;
  for (const spec of SEED_PRS) {
    number += Math.floor(random() * 7) + 1;
    const author = spec.author ?? PEOPLE[number % PEOPLE.length]!;
    const repositoryId = repoIdByName.get(spec.repo)!;
    const nodeId = `seed-pr-${spec.repo}-${number}`;
    const updatedAt = hoursAgo(spec.updatedHoursAgo);

    const values = {
      repositoryId,
      number,
      title: spec.title,
      url: `https://github.com/acme-industries/${spec.repo}/pull/${number}`,
      state: (spec.state ?? "OPEN") as PullRequestState,
      isDraft: spec.isDraft ?? false,
      authorLogin: author,
      authorAvatarUrl: avatar(author),
      additions: spec.additions,
      deletions: spec.deletions,
      changedFiles: Math.max(1, Math.round((spec.additions + spec.deletions) / 60)),
      commentCount: spec.comments ?? 0,
      reviewDecision: (spec.reviewDecision ?? null) as ReviewDecision | null,
      mergeable: (spec.mergeable ?? "MERGEABLE") as MergeableState,
      checksState: (spec.checksState ?? null) as ChecksState | null,
      createdAt: hoursAgo(spec.updatedHoursAgo + 48),
      updatedAt,
      mergedAt: null,
      closedAt: null,
      syncedAt: seededAt,
    };

    const [pr] = await db()
      .insert(pullRequests)
      .values({ nodeId, ...values })
      .onConflictDoUpdate({ target: pullRequests.nodeId, set: values })
      .returning({ id: pullRequests.id });
    const prId = pr!.id;

    // Replaced wholesale, exactly as the real sync does.
    await db().delete(pullRequestReviews).where(eq(pullRequestReviews.pullRequestId, prId));
    await db()
      .delete(pullRequestReviewRequests)
      .where(eq(pullRequestReviewRequests.pullRequestId, prId));
    await db().delete(pullRequestAssignees).where(eq(pullRequestAssignees.pullRequestId, prId));

    for (const review of spec.reviewed ?? []) {
      await db().insert(pullRequestReviews).values({
        nodeId: `${nodeId}-review-${review.login}`,
        pullRequestId: prId,
        reviewerLogin: review.login,
        reviewerAvatarUrl: avatar(review.login),
        state: review.state,
        submittedAt: hoursAgo(spec.updatedHoursAgo + 1),
      });
    }

    for (const login of spec.requested ?? []) {
      await db().insert(pullRequestReviewRequests).values({
        pullRequestId: prId,
        requestedLogin: login,
        isTeam: false,
        avatarUrl: avatar(login),
      });
    }

    for (const login of spec.assignees ?? []) {
      await db().insert(pullRequestAssignees).values({
        pullRequestId: prId,
        login,
        avatarUrl: avatar(login),
      });
    }

    // Involvement, derived exactly as the sync derives it.
    const isAuthor = author === LOGIN;
    const isReviewRequested = (spec.requested ?? []).includes(LOGIN);
    const isAssigned = (spec.assignees ?? []).includes(LOGIN);
    const hasReviewed = (spec.reviewed ?? []).some((r) => r.login === LOGIN);

    if (isAuthor || isReviewRequested || isAssigned || hasReviewed) {
      const row = {
        isAuthor,
        isReviewRequested,
        isAssigned,
        isMentioned: false,
        hasReviewed,
        isRepositoryOwner: false,
        bucket: classify({
          isAuthor,
          isReviewRequested,
          isAssigned,
          isRepositoryOwner: false,
          authorIsBot: false,
          isDraft: values.isDraft,
          state: values.state,
          reviewDecision: values.reviewDecision,
          checksState: values.checksState,
          mergeable: values.mergeable,
        }),
        lastSeenAt: seededAt,
      };
      await db()
        .insert(pullRequestInvolvement)
        .values({ userId, pullRequestId: prId, ...row })
        .onConflictDoUpdate({
          target: [pullRequestInvolvement.userId, pullRequestInvolvement.pullRequestId],
          set: row,
        });
    }
  }

  // --- a successful sync run, so the UI has something to report ---------
  // Cleared first: sync runs are append-only in normal operation, so without
  // this a re-seed would leave the previous run as the most recent one and the
  // freshness indicator would report the older timestamp.
  await db().delete(syncRuns).where(eq(syncRuns.installationId, installationId));

  await db().insert(syncRuns).values({
    installationId,
    kind: "installation_pull_requests",
    status: "succeeded",
    startedAt: seededAt,
    finishedAt: new Date(seededAt.getTime() + 3_400),
    itemsSynced: SEED_PRS.length,
    rateLimitCost: 4,
    rateLimitRemaining: 4_962,
    rateLimitResetAt: new Date(NOW + 41 * 60_000),
  });

  console.log(
    `Seeded ${SEED_PRS.length} pull requests across ${REPOS.length} repositories for "${LOGIN}".`,
  );
}

await seed();
await closeDb();
