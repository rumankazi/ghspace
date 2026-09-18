import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  boolean,
  timestamp,
  customType,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * Tokens are stored as AES-256-GCM ciphertext, never as plaintext. See lib/crypto.ts.
 * `bytea` rather than text so there is no chance of a value being logged as a
 * readable-looking string.
 */
const encrypted = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const now = sql`now()`;

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

/**
 * A ghspace user. This is the tenant root: every row that is specific to one
 * person's view of GitHub hangs off `users.id`, even while there is only one
 * of them. Opening ghspace up to other people should not require a migration.
 */
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    githubUserId: bigint({ mode: "number" }).notNull(),
    githubLogin: text().notNull(),
    name: text(),
    email: text(),
    avatarUrl: text(),
    /**
     * GitHub API root this user's data comes from. Public GitHub for now, but
     * carrying it per-user from day one is what makes GitHub Enterprise Server
     * support a configuration change later rather than a schema change.
     */
    apiBaseUrl: text().notNull().default("https://api.github.com"),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    updatedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("users_github_user_id_key").on(t.githubUserId)],
);

/**
 * User-to-server OAuth credentials for a user. Separated from `users` so that
 * the common path of reading a user profile never pulls secrets into memory.
 *
 * GitHub user access tokens expire after ~8 hours and are renewed with a
 * refresh token valid for ~6 months, so refresh is a required background job,
 * not an error path.
 */
export const githubCredentials = pgTable("github_credentials", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: encrypted().notNull(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshToken: encrypted(),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scopes: text().array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  updatedAt: timestamp({ withTimezone: true }).notNull().default(now),
});

// ---------------------------------------------------------------------------
// App installations
// ---------------------------------------------------------------------------

/**
 * A GitHub App installation on a user or organization account.
 *
 * This is what actually determines visibility. A GitHub App — including its
 * user access tokens — can only reach accounts where it is installed, so a
 * dashboard is only ever as complete as the set of installations behind it.
 * Storing them lets the UI tell the user what it can and cannot see instead of
 * silently omitting an org.
 */
export const installations = pgTable(
  "installations",
  {
    id: uuid().primaryKey().defaultRandom(),
    githubInstallationId: bigint({ mode: "number" }).notNull(),
    accountLogin: text().notNull(),
    /** "User" or "Organization". */
    accountType: text().notNull(),
    accountAvatarUrl: text(),
    /** "all" or "selected" — whether the install covers every repo in the account. */
    repositorySelection: text().notNull().default("selected"),
    /** Where the account owner manages which repos this installation can see. */
    htmlUrl: text(),
    suspendedAt: timestamp({ withTimezone: true }),
    syncedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("installations_github_id_key").on(t.githubInstallationId)],
);

/**
 * Which installations a given user can actually see through. The same
 * installation is shared by every ghspace user in that org, but each of them
 * reaches a different subset of its repositories, so the repository count is
 * recorded per user rather than per installation.
 */
export const userInstallations = pgTable(
  "user_installations",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: uuid()
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    /** Repositories in this installation that *this* user can access. */
    repositoryCount: integer().notNull().default(0),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.installationId] }),
    index("user_installations_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Cached GitHub data (shared across tenants, keyed by GitHub's own identifiers)
// ---------------------------------------------------------------------------

/**
 * Repository metadata. Deduplicated globally by GitHub node id: if two users
 * both watch the same repo we store and refresh it once. Nothing here is
 * private to a tenant beyond the fact that they can see it, which is recorded
 * on `pullRequestInvolvement` instead.
 */
export const repositories = pgTable(
  "repositories",
  {
    id: uuid().primaryKey().defaultRandom(),
    nodeId: text().notNull(),
    owner: text().notNull(),
    name: text().notNull(),
    nameWithOwner: text().notNull(),
    isPrivate: boolean().notNull().default(false),
    isArchived: boolean().notNull().default(false),
    url: text().notNull(),
    /**
     * The installation whose token fetches this repository's pull requests.
     * Null for a repository that was only ever seen embedded in a pull request
     * from elsewhere.
     */
    installationId: uuid().references(() => installations.id, { onDelete: "set null" }),
    syncedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("repositories_node_id_key").on(t.nodeId),
    index("repositories_name_with_owner_idx").on(t.nameWithOwner),
    index("repositories_installation_idx").on(t.installationId),
  ],
);

/**
 * Which repositories a given user may see.
 *
 * This is a security boundary, not a convenience index. Pull requests are
 * fetched with an *installation* token, which can read every repository in the
 * installation — including ones a particular ghspace user has no access to.
 * Every read path must therefore filter through this table, which is built from
 * `GET /user/installations/{id}/repositories` using that user's own token.
 */
export const userRepositoryAccess = pgTable(
  "user_repository_access",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repositoryId: uuid()
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.repositoryId] }),
    index("user_repository_access_user_idx").on(t.userId),
  ],
);

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";
export type MergeableState = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
export type ChecksState = "SUCCESS" | "FAILURE" | "PENDING" | "EXPECTED" | "ERROR";

/**
 * The cached state of a pull request. This is the cache-of-record the UI reads
 * from: pages render from this table and never call the GitHub API inline, so
 * a rate-limited or unreachable GitHub degrades to slightly stale data rather
 * than a broken page. `syncedAt` is what the UI surfaces as "synced 4m ago".
 */
export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    nodeId: text().notNull(),
    repositoryId: uuid()
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    state: text().$type<PullRequestState>().notNull(),
    isDraft: boolean().notNull().default(false),

    authorLogin: text(),
    authorAvatarUrl: text(),
    /**
     * From GraphQL's `__typename` on the author, which is the only reliable
     * signal — the login alone does not carry the `[bot]` suffix, and plenty of
     * humans have bot-like names.
     */
    authorIsBot: boolean().notNull().default(false),

    additions: integer().notNull().default(0),
    deletions: integer().notNull().default(0),
    changedFiles: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),

    /** GitHub's aggregate verdict across all requested reviewers. */
    reviewDecision: text().$type<ReviewDecision>(),
    mergeable: text().$type<MergeableState>(),
    /** Rolled up from the head commit's status checks and check runs. */
    checksState: text().$type<ChecksState>(),

    createdAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
    mergedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),

    syncedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("pull_requests_node_id_key").on(t.nodeId),
    index("pull_requests_repository_idx").on(t.repositoryId),
    index("pull_requests_updated_at_idx").on(t.updatedAt),
  ],
);

/** A review that has actually been submitted on a PR. */
export const pullRequestReviews = pgTable(
  "pull_request_reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    nodeId: text().notNull(),
    pullRequestId: uuid()
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    reviewerLogin: text(),
    reviewerAvatarUrl: text(),
    state: text().notNull(),
    submittedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pull_request_reviews_node_id_key").on(t.nodeId),
    index("pull_request_reviews_pr_idx").on(t.pullRequestId),
  ],
);

/** A reviewer (user or team) whose review has been requested but not yet given. */
export const pullRequestReviewRequests = pgTable(
  "pull_request_review_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    pullRequestId: uuid()
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    /** Login for a user, slug for a team. */
    requestedLogin: text().notNull(),
    isTeam: boolean().notNull().default(false),
    avatarUrl: text(),
  },
  (t) => [
    uniqueIndex("pr_review_requests_key").on(t.pullRequestId, t.requestedLogin),
    index("pr_review_requests_pr_idx").on(t.pullRequestId),
  ],
);

/**
 * Assignees on a pull request. Stored rather than derived because involvement
 * is now computed at read time from cached data, and because the dashboard
 * filters by assignee.
 */
export const pullRequestAssignees = pgTable(
  "pull_request_assignees",
  {
    id: uuid().primaryKey().defaultRandom(),
    pullRequestId: uuid()
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    login: text().notNull(),
    avatarUrl: text(),
  },
  (t) => [
    uniqueIndex("pr_assignees_key").on(t.pullRequestId, t.login),
    index("pr_assignees_pr_idx").on(t.pullRequestId),
  ],
);

// ---------------------------------------------------------------------------
// The tenant-scoped join: why does *this* user care about this PR?
// ---------------------------------------------------------------------------

export type TriageBucket =
  | "blocked_on_you"
  | "needs_your_action"
  | "ready_to_merge"
  | "blocked_on_others"
  | "drafts"
  | "watching"
  | "dependency_updates";

/**
 * Links a user to a PR and records the reason. GitHub's `involves:@me` is a
 * single flat result set; splitting the reasons out here is what lets the UI
 * sort PRs into action buckets instead of showing one long list.
 *
 * `bucket` is derived (see sync/buckets.ts) and denormalised onto the row so
 * the read path is a plain indexed lookup rather than a per-request
 * recomputation across joins.
 */
export const pullRequestInvolvement = pgTable(
  "pull_request_involvement",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pullRequestId: uuid()
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),

    isAuthor: boolean().notNull().default(false),
    isReviewRequested: boolean().notNull().default(false),
    isAssigned: boolean().notNull().default(false),
    isMentioned: boolean().notNull().default(false),
    /** Has already submitted at least one review. */
    hasReviewed: boolean().notNull().default(false),
    /**
     * The repository belongs to this user's own account.
     *
     * Not an involvement signal GitHub recognises, but decisive in practice: a
     * bot's dependency bump in your own repository names you nowhere, yet
     * nobody else is going to merge it. Without this the triage view silently
     * omits most of a solo developer's actual queue.
     */
    isRepositoryOwner: boolean().notNull().default(false),

    bucket: text().$type<TriageBucket>().notNull(),

    /**
     * Last sync run that still saw this PR in the user's result set. Rows that
     * fall behind the current run are swept, which is how a PR that was merged
     * or that the user was un-assigned from leaves the dashboard.
     */
    lastSeenAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.pullRequestId] }),
    index("pr_involvement_user_bucket_idx").on(t.userId, t.bucket),
  ],
);

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export type SyncStatus = "running" | "succeeded" | "failed";

/**
 * One row per background sync attempt. Two jobs at once: it powers the "last
 * synced" indicator the UI needs in order to be honest about staleness, and it
 * records the GitHub rate-limit headers so budget burn is visible before it
 * starts causing failures.
 */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Set for user-scoped work (access refresh); null for installation syncs. */
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    /** Set for installation-scoped work (pull request fetching); null otherwise. */
    installationId: uuid().references(() => installations.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    status: text().$type<SyncStatus>().notNull(),

    startedAt: timestamp({ withTimezone: true }).notNull().default(now),
    finishedAt: timestamp({ withTimezone: true }),

    itemsSynced: integer().notNull().default(0),
    error: text(),

    rateLimitCost: integer(),
    rateLimitRemaining: integer(),
    rateLimitResetAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("sync_runs_user_started_idx").on(t.userId, t.startedAt.desc()),
    index("sync_runs_installation_started_idx").on(t.installationId, t.startedAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  credentials: one(githubCredentials, {
    fields: [users.id],
    references: [githubCredentials.userId],
  }),
  involvement: many(pullRequestInvolvement),
  installations: many(userInstallations),
  syncRuns: many(syncRuns),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  pullRequests: many(pullRequests),
  installation: one(installations, {
    fields: [repositories.installationId],
    references: [installations.id],
  }),
  userAccess: many(userRepositoryAccess),
}));

export const userRepositoryAccessRelations = relations(userRepositoryAccess, ({ one }) => ({
  user: one(users, { fields: [userRepositoryAccess.userId], references: [users.id] }),
  repository: one(repositories, {
    fields: [userRepositoryAccess.repositoryId],
    references: [repositories.id],
  }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repositoryId],
    references: [repositories.id],
  }),
  reviews: many(pullRequestReviews),
  reviewRequests: many(pullRequestReviewRequests),
  assignees: many(pullRequestAssignees),
  involvement: many(pullRequestInvolvement),
}));

export const pullRequestAssigneesRelations = relations(pullRequestAssignees, ({ one }) => ({
  pullRequest: one(pullRequests, {
    fields: [pullRequestAssignees.pullRequestId],
    references: [pullRequests.id],
  }),
}));

export const pullRequestReviewsRelations = relations(pullRequestReviews, ({ one }) => ({
  pullRequest: one(pullRequests, {
    fields: [pullRequestReviews.pullRequestId],
    references: [pullRequests.id],
  }),
}));

export const pullRequestReviewRequestsRelations = relations(
  pullRequestReviewRequests,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestReviewRequests.pullRequestId],
      references: [pullRequests.id],
    }),
  }),
);

export const pullRequestInvolvementRelations = relations(
  pullRequestInvolvement,
  ({ one }) => ({
    user: one(users, {
      fields: [pullRequestInvolvement.userId],
      references: [users.id],
    }),
    pullRequest: one(pullRequests, {
      fields: [pullRequestInvolvement.pullRequestId],
      references: [pullRequests.id],
    }),
  }),
);

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  user: one(users, { fields: [syncRuns.userId], references: [users.id] }),
}));

export const installationsRelations = relations(installations, ({ many }) => ({
  users: many(userInstallations),
  repositories: many(repositories),
}));

export const userInstallationsRelations = relations(userInstallations, ({ one }) => ({
  user: one(users, { fields: [userInstallations.userId], references: [users.id] }),
  installation: one(installations, {
    fields: [userInstallations.installationId],
    references: [installations.id],
  }),
}));
