import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client.ts";
import { repositories, repositoryWorkflows, syncRuns } from "../db/schema.ts";
import { sqlExcluded } from "../db/sql.ts";
import { createInstallationClient } from "../github/app.ts";
import {
  ActionsUnavailableError,
  fetchRepositoryWorkflows,
  type WorkflowStatus,
} from "../github/actions.ts";
import { log, timed } from "../lib/logger.ts";
import { failRun, startInstallationRun } from "./runs.ts";

export const ACTIONS_SYNC_KIND = "installation_workflow_runs";

export interface ActionsSyncOutcome {
  syncRunId: string;
  repositoryCount: number;
  workflowCount: number;
  /** Repositories skipped because ghspace cannot read their Actions. */
  skippedCount: number;
}

interface WorkflowRows {
  repositoryId: string;
  statuses: WorkflowStatus[];
}

/**
 * Refreshes default-branch workflow state for one installation.
 *
 * A separate sync run from the pull request sync, rather than another step
 * inside it. Actions needs its own `actions: read` permission, so an
 * installation that has not granted it fails *this* job on every cycle while
 * pull request triage keeps working — and the Actions view can then say so
 * instead of rendering as empty.
 *
 * Repositories come from the cache rather than from a fresh listing: the pull
 * request sync has just written them, and asking GitHub again would spend a
 * request per cycle to learn something ghspace already knows.
 */
export async function syncInstallationActions(
  installationRowId: string,
): Promise<ActionsSyncOutcome> {
  const startedAt = new Date();

  const { installation, syncRunId } = await startInstallationRun(
    installationRowId,
    ACTIONS_SYNC_KIND,
    startedAt,
  );

  try {
    if (installation.suspendedAt) throw new Error("Installation is suspended");

    const client = createInstallationClient(installation.githubInstallationId);
    const account = installation.accountLogin;

    const repos = await db()
      .select({
        id: repositories.id,
        owner: repositories.owner,
        name: repositories.name,
        nameWithOwner: repositories.nameWithOwner,
        defaultBranch: repositories.defaultBranch,
      })
      .from(repositories)
      .where(
        and(
          eq(repositories.installationId, installation.id),
          eq(repositories.isArchived, false),
        ),
      );

    const fetched: WorkflowRows[] = [];
    let forbidden = 0;
    let skipped = 0;

    await timed("fetching workflow runs", { account, repositories: repos.length }, async () => {
      for (const repo of repos) {
        try {
          const statuses = await fetchRepositoryWorkflows(client, repo);

          fetched.push({ repositoryId: repo.id, statuses });
        } catch (error) {
          if (!(error instanceof ActionsUnavailableError)) throw error;

          skipped++;

          if (error.reason === "forbidden") forbidden++;

          // Debug, not warn: a repository with Actions switched off is the
          // ordinary case, and one line per repository per cycle would bury
          // the failures this view exists to show.
          log.debug("skipping repository", {
            repository: repo.nameWithOwner,
            reason: error.reason,
          });
        }
      }
    });

    // Every repository refused, and at least one refused for permission: the
    // installation has no `actions: read`. Failing the run puts that on screen
    // as an error, where an empty view would read as "no workflows".
    if (fetched.length === 0 && forbidden > 0) {
      throw new Error(
        "The GitHub App is missing the Actions read permission for this account",
      );
    }

    const workflowCount = await writeSnapshot(fetched, startedAt);

    await db()
      .update(syncRuns)
      .set({ status: "succeeded", finishedAt: new Date(), itemsSynced: workflowCount })
      .where(eq(syncRuns.id, syncRunId));

    log.info("actions sync succeeded", {
      account,
      repositories: fetched.length,
      skipped,
      workflows: workflowCount,
      ms: Date.now() - startedAt.getTime(),
    });

    return {
      syncRunId,
      repositoryCount: fetched.length,
      workflowCount,
      skippedCount: skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await failRun(syncRunId, message);

    log.error("actions sync failed", {
      installation: installation.accountLogin,
      error: message,
    });
    throw error;
  }
}

/**
 * Replaces the workflow rows of the repositories this run actually reached.
 *
 * Scoped to those repositories on purpose. A repository that errored keeps the
 * rows it had, because a 403 from one repository is no evidence that its
 * workflows are gone — whereas a workflow missing from a listing that *did*
 * come back has been deleted or disabled, and its row goes.
 */
async function writeSnapshot(fetched: WorkflowRows[], startedAt: Date): Promise<number> {
  if (fetched.length === 0) return 0;

  const values = fetched.flatMap((entry) =>
    entry.statuses.map((status) => ({
      repositoryId: entry.repositoryId,
      githubWorkflowId: status.githubWorkflowId,
      name: status.name,
      path: status.path,
      runId: status.run?.id ?? null,
      runNumber: status.run?.runNumber ?? null,
      runAttempt: status.run?.runAttempt ?? null,
      status: status.run?.status ?? null,
      conclusion: status.run?.conclusion ?? null,
      event: status.run?.event ?? null,
      branch: status.run?.branch ?? null,
      headSha: status.run?.headSha ?? null,
      headCommitMessage: status.run?.headCommitMessage ?? null,
      actorLogin: status.run?.actorLogin ?? null,
      actorAvatarUrl: status.run?.actorAvatarUrl ?? null,
      runUrl: status.run?.url ?? null,
      runStartedAt: status.run?.startedAt ?? null,
      runUpdatedAt: status.run?.updatedAt ?? null,
      syncedAt: startedAt,
    })),
  );

  const reached = fetched.map((entry) => entry.repositoryId);

  return db().transaction(async (tx) => {
    const CHUNK = 500;

    for (let i = 0; i < values.length; i += CHUNK) {
      await tx
        .insert(repositoryWorkflows)
        .values(values.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [repositoryWorkflows.repositoryId, repositoryWorkflows.githubWorkflowId],
          set: {
            name: sqlExcluded("name"),
            path: sqlExcluded("path"),
            runId: sqlExcluded("run_id"),
            runNumber: sqlExcluded("run_number"),
            runAttempt: sqlExcluded("run_attempt"),
            status: sqlExcluded("status"),
            conclusion: sqlExcluded("conclusion"),
            event: sqlExcluded("event"),
            branch: sqlExcluded("branch"),
            headSha: sqlExcluded("head_sha"),
            headCommitMessage: sqlExcluded("head_commit_message"),
            actorLogin: sqlExcluded("actor_login"),
            actorAvatarUrl: sqlExcluded("actor_avatar_url"),
            runUrl: sqlExcluded("run_url"),
            runStartedAt: sqlExcluded("run_started_at"),
            runUpdatedAt: sqlExcluded("run_updated_at"),
            syncedAt: startedAt,
          },
        });
    }

    await tx
      .delete(repositoryWorkflows)
      .where(
        and(
          inArray(repositoryWorkflows.repositoryId, reached),
          lt(repositoryWorkflows.syncedAt, startedAt),
        ),
      );

    return values.length;
  });
}
