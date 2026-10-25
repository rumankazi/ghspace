import { z } from "zod";
import type { GitHubClient } from "./client.ts";
import type {
  WorkflowRunConclusion,
  WorkflowRunStatus,
} from "../db/schema.ts";
import { log } from "../lib/logger.ts";

/**
 * Workflow state on a repository's default branch.
 *
 * REST rather than GraphQL throughout: GraphQL exposes check suites, which is a
 * different thing from a workflow run — a check suite has no workflow identity,
 * no run number and no `workflow_dispatch` event, so a roll-up built from it
 * cannot say *which* workflow is red or whether a nightly job ran at all.
 */

const listedWorkflow = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string().optional(),
  /** "active", "disabled_manually", "disabled_inactivity", ... */
  state: z.string(),
});

const workflowPage = z.object({
  total_count: z.number(),
  workflows: z.array(listedWorkflow),
});

const listedRun = z.object({
  id: z.number(),
  workflow_id: z.number(),
  name: z.string().nullable().optional(),
  run_number: z.number(),
  run_attempt: z.number().optional(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  event: z.string(),
  head_branch: z.string().nullable(),
  head_sha: z.string(),
  head_commit: z.object({ message: z.string() }).nullable().optional(),
  actor: z.object({ login: z.string(), avatar_url: z.string().optional() }).nullable().optional(),
  html_url: z.string(),
  run_started_at: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const runPage = z.object({
  total_count: z.number(),
  workflow_runs: z.array(listedRun),
});

/** How many recent default-branch runs one request looks through. */
const RUNS_PER_REQUEST = 100;

export interface WorkflowRunFacts {
  id: number;
  runNumber: number;
  runAttempt: number | null;
  status: WorkflowRunStatus | null;
  /** Null while the run is still going; GitHub only concludes a finished run. */
  conclusion: WorkflowRunConclusion | null;
  event: string;
  branch: string | null;
  headSha: string;
  headCommitMessage: string | null;
  actorLogin: string | null;
  actorAvatarUrl: string | null;
  url: string;
  startedAt: Date;
  updatedAt: Date;
}

export interface WorkflowStatus {
  githubWorkflowId: number;
  name: string;
  path: string | null;
  /** Null for a workflow that has never run on the default branch. */
  run: WorkflowRunFacts | null;
}

export interface ActionsRepositoryRef {
  owner: string;
  name: string;
  defaultBranch: string | null;
}

/**
 * Why a repository has no Actions data, as far as this sync can tell.
 *
 * Worth distinguishing from a failure: both leave the repository out of the
 * view, but only one of them is something the operator can fix.
 */
export type ActionsUnavailableReason = "forbidden" | "not_found" | "no_default_branch";

export class ActionsUnavailableError extends Error {
  readonly reason: ActionsUnavailableReason;

  constructor(reason: ActionsUnavailableReason, message: string) {
    super(message);
    this.name = "ActionsUnavailableError";
    this.reason = reason;
  }
}

/**
 * The status Octokit puts on a failed request.
 *
 * Parsed rather than read off the error: a thrown value is the least trustworthy
 * input in the file, and a network failure arrives here as an `Error` with no
 * status at all.
 */
const requestFailure = z.object({ status: z.number() });

/**
 * The two "nothing to see here" responses, as a typed outcome.
 *
 * 403 is the one that matters operationally: it means the installation has no
 * `actions: read` permission, so *every* repository will come back empty and
 * the view would look like a sync that never ran. 404 is ordinary — Actions is
 * disabled for that repository, or it has none of its own workflows.
 *
 * Null for anything else, which stays an exception: a 500 or a timeout is not
 * evidence about the repository, and swallowing it here would turn an outage
 * into a page full of green repositories.
 */
function unavailableFor(
  status: number,
  repo: ActionsRepositoryRef,
): ActionsUnavailableError | null {
  if (status === 403) {
    return new ActionsUnavailableError(
      "forbidden",
      `No permission to read Actions in ${repo.owner}/${repo.name}`,
    );
  }

  if (status === 404 || status === 410) {
    return new ActionsUnavailableError(
      "not_found",
      `Actions is unavailable in ${repo.owner}/${repo.name}`,
    );
  }

  return null;
}

/** Every workflow GitHub currently runs in this repository. */
async function listActiveWorkflows(
  client: GitHubClient,
  repo: ActionsRepositoryRef,
): Promise<z.infer<typeof listedWorkflow>[]> {
  const found: z.infer<typeof listedWorkflow>[] = [];

  for (let page = 1; ; page++) {
    const raw = await client.request("GET /repos/{owner}/{repo}/actions/workflows", {
      owner: repo.owner,
      repo: repo.name,
      per_page: 100,
      page,
    });

    const parsed = workflowPage.parse(raw.data);

    found.push(...parsed.workflows);

    if (found.length >= parsed.total_count || parsed.workflows.length === 0) break;
  }

  // A workflow someone disabled, or one GitHub disabled for inactivity, is not
  // part of "is the default branch healthy" — its last run says nothing about
  // the branch today.
  return found.filter((workflow) => workflow.state === "active");
}

/**
 * The newest default-branch run of each workflow, from one page of runs.
 *
 * One request rather than one per workflow. The trade is stated in the log
 * below: a repository whose busiest workflow fills the page can hide a quiet
 * workflow's run, and that workflow then reports as never-run rather than
 * silently inheriting a stale verdict.
 */
async function fetchLatestRuns(
  client: GitHubClient,
  repo: ActionsRepositoryRef,
  branch: string,
): Promise<{ latest: Map<number, WorkflowRunFacts>; pageFull: boolean }> {
  const raw = await client.request("GET /repos/{owner}/{repo}/actions/runs", {
    owner: repo.owner,
    repo: repo.name,
    branch,
    // Runs for a pull request against the default branch say nothing about the
    // branch itself, and the pull request views already show their checks.
    exclude_pull_requests: true,
    per_page: RUNS_PER_REQUEST,
  });

  const parsed = runPage.parse(raw.data);
  const latest = new Map<number, WorkflowRunFacts>();

  for (const run of parsed.workflow_runs) {
    const facts = toFacts(run);
    const held = latest.get(run.workflow_id);

    // Ordered newest-first by GitHub, but compared anyway: relying on the
    // order would make a quiet change in the API read as a stale verdict here.
    if (!held || held.runNumber < facts.runNumber) latest.set(run.workflow_id, facts);
  }

  return { latest, pageFull: parsed.workflow_runs.length >= RUNS_PER_REQUEST };
}

function toFacts(run: z.infer<typeof listedRun>): WorkflowRunFacts {
  return {
    id: run.id,
    runNumber: run.run_number,
    runAttempt: run.run_attempt ?? null,
    // Narrowed to the union the column carries. Unknown values from a newer
    // API land as null, which the read path treats as "no verdict" rather than
    // inventing one.
    status: asStatus(run.status),
    conclusion: asConclusion(run.conclusion),
    event: run.event,
    branch: run.head_branch,
    headSha: run.head_sha,
    headCommitMessage: run.head_commit?.message ?? null,
    actorLogin: run.actor?.login ?? null,
    actorAvatarUrl: run.actor?.avatar_url ?? null,
    url: run.html_url,
    startedAt: new Date(run.run_started_at ?? run.created_at),
    updatedAt: new Date(run.updated_at),
  };
}

const STATUSES = new Set<string>([
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
]);

const CONCLUSIONS = new Set<string>([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "neutral",
  "stale",
  "startup_failure",
]);

function asStatus(value: string | null): WorkflowRunStatus | null {
  if (value === null || !STATUSES.has(value)) return null;

  // SAFETY: guarded by STATUSES, which is the union's own member list.
  return value as WorkflowRunStatus;
}

function asConclusion(value: string | null): WorkflowRunConclusion | null {
  if (value === null || !CONCLUSIONS.has(value)) return null;

  // SAFETY: guarded by CONCLUSIONS, which is the union's own member list.
  return value as WorkflowRunConclusion;
}

/**
 * Every active workflow in one repository, with its latest default-branch run.
 *
 * Two requests per repository: the workflow listing is what makes a workflow
 * that has never run on the default branch visible at all, and without it the
 * view could only ever report workflows that happen to have run recently.
 *
 * Throws `ActionsUnavailableError` for a repository ghspace cannot read
 * Actions in, so the caller can skip it without failing the whole sync.
 */
export async function fetchRepositoryWorkflows(
  client: GitHubClient,
  repo: ActionsRepositoryRef,
): Promise<WorkflowStatus[]> {
  if (!repo.defaultBranch) {
    throw new ActionsUnavailableError(
      "no_default_branch",
      `${repo.owner}/${repo.name} has no default branch`,
    );
  }

  const branch = repo.defaultBranch;

  try {
    const workflows = await listActiveWorkflows(client, repo);

    if (workflows.length === 0) return [];

    const { latest, pageFull } = await fetchLatestRuns(client, repo, branch);

    const statuses = workflows.map((workflow) => ({
      githubWorkflowId: workflow.id,
      name: workflow.name,
      path: workflow.path ?? null,
      run: latest.get(workflow.id) ?? null,
    }));

    const unseen = statuses.filter((status) => status.run === null).length;

    // Only worth saying when the page was full: with room to spare, a workflow
    // with no run really has not run on this branch.
    if (unseen > 0 && pageFull) {
      log.warn("default-branch runs hit the page ceiling; some workflows report as never run", {
        repository: `${repo.owner}/${repo.name}`,
        branch,
        ceiling: RUNS_PER_REQUEST,
        workflowsWithoutRun: unseen,
      });
    }

    return statuses;
  } catch (error) {
    const failure = requestFailure.safeParse(error);
    const unavailable = failure.success ? unavailableFor(failure.data.status, repo) : null;

    if (unavailable) throw unavailable;

    throw error;
  }
}
