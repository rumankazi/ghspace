import { and, count, eq, notExists, sql } from "drizzle-orm";
import { db } from "./db/client.ts";
import {
  repositories,
  repositoryWorkflows,
  type WorkflowRunConclusion,
  type WorkflowRunStatus,
} from "./db/schema.ts";
import { getSyncState, type SyncState } from "./dashboard.ts";
import { ACTIONS_SYNC_KIND } from "./sync/actions-sync.ts";
import { visibleToUser } from "./visibility.ts";
import {
  HEALTH_SEVERITY,
  workflowHealth,
  worstHealth,
  type WorkflowHealth,
} from "./workflow-health.ts";

export interface WorkflowSummary {
  id: string;
  name: string;
  path: string | null;
  health: WorkflowHealth;
  /**
   * Whether there is a run behind these fields at all. `health` cannot answer
   * this: a workflow that has never run and one whose last run was cancelled
   * are both `idle`, and only the first should read as "never run".
   */
  hasRun: boolean;
  status: WorkflowRunStatus | null;
  conclusion: WorkflowRunConclusion | null;
  event: string | null;
  runNumber: number | null;
  runAttempt: number | null;
  headSha: string | null;
  headCommitMessage: string | null;
  actor: { login: string | null; avatarUrl: string | null };
  runUrl: string | null;
  runStartedAt: Date | null;
  runUpdatedAt: Date | null;
}

export interface RepositoryActions {
  repository: {
    id: string;
    nameWithOwner: string;
    owner: string;
    isPrivate: boolean;
    url: string;
    defaultBranch: string | null;
  };
  /** The worst state among this repository's workflows. */
  health: WorkflowHealth;
  workflows: WorkflowSummary[];
  failingCount: number;
  runningCount: number;
  /** Newest run across these workflows; null when none has ever run. */
  lastRunAt: Date | null;
}

export interface ActionsOverview {
  repositories: RepositoryActions[];
  counts: {
    repositories: number;
    failing: number;
    running: number;
    passing: number;
    idle: number;
    workflows: number;
    /**
     * Repositories this user can see that have no active workflow at all.
     * Counted rather than listed: naming them would be a second, longer list
     * of repositories with nothing to report.
     */
    withoutWorkflows: number;
  };
  /** The Actions sync's own state, so a missing permission reads as an error. */
  sync: SyncState;
}

/**
 * Default-branch workflow state for every repository this user can see.
 *
 * Read entirely from the cache, like every other page: the worker holds the
 * GitHub conversation, so this view costs one query no matter how many
 * repositories or workflows it covers.
 *
 * Failing repositories sort first, then running, then by name. A red workflow
 * is the only reason to open this page in a hurry, and a page that sorts
 * alphabetically buries it under whatever is called `api`.
 */
export async function getActionsOverview(userId: string): Promise<ActionsOverview> {
  const [rows, [missing], sync] = await Promise.all([
    db()
      .select({
        repositoryId: repositories.id,
        nameWithOwner: repositories.nameWithOwner,
        owner: repositories.owner,
        isPrivate: repositories.isPrivate,
        url: repositories.url,
        defaultBranch: repositories.defaultBranch,
        workflow: repositoryWorkflows,
      })
      .from(repositoryWorkflows)
      .innerJoin(repositories, eq(repositories.id, repositoryWorkflows.repositoryId))
      .where(visibleToUser(userId, repositories.id)),

    db()
      .select({ value: count() })
      .from(repositories)
      .where(
        and(
          visibleToUser(userId, repositories.id),
          eq(repositories.isArchived, false),
          notExists(
            db()
              .select({ one: sql`1` })
              .from(repositoryWorkflows)
              .where(eq(repositoryWorkflows.repositoryId, repositories.id)),
          ),
        ),
      ),

    getSyncState(userId, ACTIONS_SYNC_KIND),
  ]);

  const byRepository = new Map<string, RepositoryActions>();

  for (const row of rows) {
    const existing = byRepository.get(row.repositoryId);

    // `health` is settled once the whole repository is in hand, below.
    const started: RepositoryActions = {
      repository: {
        id: row.repositoryId,
        nameWithOwner: row.nameWithOwner,
        owner: row.owner,
        isPrivate: row.isPrivate,
        url: row.url,
        defaultBranch: row.defaultBranch,
      },
      health: "idle",
      workflows: [],
      failingCount: 0,
      runningCount: 0,
      lastRunAt: null,
    };

    const group = existing ?? started;

    if (!existing) byRepository.set(row.repositoryId, group);

    const workflow = row.workflow;
    const health = workflowHealth(workflow);

    group.workflows.push({
      id: workflow.id,
      name: workflow.name,
      path: workflow.path,
      health,
      hasRun: workflow.runId !== null,
      status: workflow.status,
      conclusion: workflow.conclusion,
      event: workflow.event,
      runNumber: workflow.runNumber,
      runAttempt: workflow.runAttempt,
      headSha: workflow.headSha,
      headCommitMessage: workflow.headCommitMessage,
      actor: { login: workflow.actorLogin, avatarUrl: workflow.actorAvatarUrl },
      runUrl: workflow.runUrl,
      runStartedAt: workflow.runStartedAt,
      runUpdatedAt: workflow.runUpdatedAt,
    });

    if (health === "failing") group.failingCount++;

    if (health === "running") group.runningCount++;

    const ran = workflow.runStartedAt;

    if (ran && (!group.lastRunAt || group.lastRunAt < ran)) group.lastRunAt = ran;
  }

  const groups = [...byRepository.values()];

  for (const group of groups) {
    group.health = worstHealth(group.workflows.map((workflow) => workflow.health));

    // Failing first inside the repository too, and the rest by name: a red
    // workflow must not sit below nine green ones in a long list.
    group.workflows.sort(
      (a, b) => HEALTH_SEVERITY[b.health] - HEALTH_SEVERITY[a.health] || a.name.localeCompare(b.name),
    );
  }

  groups.sort(
    (a, b) =>
      HEALTH_SEVERITY[b.health] - HEALTH_SEVERITY[a.health] ||
      b.failingCount - a.failingCount ||
      a.repository.nameWithOwner.localeCompare(b.repository.nameWithOwner),
  );

  const tally = (state: WorkflowHealth) => groups.filter((g) => g.health === state).length;

  return {
    repositories: groups,
    counts: {
      repositories: groups.length,
      failing: tally("failing"),
      running: tally("running"),
      passing: tally("passing"),
      idle: tally("idle"),
      workflows: rows.length,
      withoutWorkflows: missing?.value ?? 0,
    },
    sync,
  };
}
