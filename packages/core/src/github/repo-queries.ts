import { z } from "zod";
import type { GitHubClient, RateLimitSnapshot } from "./client.ts";
import { graphqlAllowingPartial, toRateLimitSnapshot } from "./client.ts";
import { PR_FIELDS, prNode, type PullRequestNode } from "./pull-request-fields.ts";
import { log } from "../lib/logger.ts";

// ---------------------------------------------------------------------------
// Repository listing
// ---------------------------------------------------------------------------

const installationRepo = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  archived: z.boolean().optional().default(false),
  html_url: z.string(),
  owner: z.object({ login: z.string(), avatar_url: z.string().optional() }),
});

const installationReposResponse = z.object({
  total_count: z.number(),
  repositories: z.array(installationRepo),
});

export interface InstallationRepository {
  nodeId: string;
  owner: string;
  name: string;
  nameWithOwner: string;
  isPrivate: boolean;
  isArchived: boolean;
  url: string;
}

/**
 * Every repository this installation can reach. REST rather than GraphQL
 * because installation-scoped repository listing has no GraphQL equivalent.
 */
export async function listInstallationRepositories(
  client: GitHubClient,
): Promise<InstallationRepository[]> {
  const results: InstallationRepository[] = [];

  for (let page = 1; ; page++) {
    const raw = await client.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });

    const parsed = installationReposResponse.parse(raw.data);

    for (const repo of parsed.repositories) {
      results.push({
        nodeId: repo.node_id,
        owner: repo.owner.login,
        name: repo.name,
        nameWithOwner: repo.full_name,
        isPrivate: repo.private,
        isArchived: repo.archived,
        url: repo.html_url,
      });
    }

    if (results.length >= parsed.total_count || parsed.repositories.length === 0) break;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Pull requests, by repository
// ---------------------------------------------------------------------------

/** Repositories per GraphQL document. Keeps any single query's cost bounded. */
const REPOS_PER_QUERY = 10;

/** Open PRs fetched per repository per page. 100 is the GraphQL maximum. */
const PAGE_SIZE = 100;

/** Ceiling on follow-up pages for one unusually busy repository. */
const MAX_PAGES_PER_REPO = 5;

interface RepoRef {
  owner: string;
  name: string;
}

/**
 * Builds a document that queries several repositories at once using aliases.
 *
 * Batching matters: one request per repository would mean hundreds of requests
 * for a large organisation, which runs into secondary rate limits long before
 * it runs out of GraphQL points.
 */
function buildBatchQuery(count: number): string {
  const params = Array.from(
    { length: count },
    (_, i) => `$owner${i}: String!, $name${i}: String!`,
  ).join(", ");

  const bodies = Array.from(
    { length: count },
    (_, i) => `
    r${i}: repository(owner: $owner${i}, name: $name${i}) {
      id
      nameWithOwner
      pullRequests(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ...PrFields }
      }
    }`,
  ).join("\n");

  return `${PR_FIELDS}
    query RepoPullRequests(${params}) {
      rateLimit { limit cost remaining resetAt }
      ${bodies}
    }`;
}

const SINGLE_REPO_QUERY = `${PR_FIELDS}
  query RepoPullRequestsPage($owner: String!, $name: String!, $after: String) {
    rateLimit { limit cost remaining resetAt }
    repository(owner: $owner, name: $name) {
      pullRequests(states: OPEN, first: ${PAGE_SIZE}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ...PrFields }
      }
    }
  }`;

const connection = z.object({
  totalCount: z.number(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable().optional(),
  }),
  nodes: z.array(z.unknown()),
});

const repoResult = z
  .object({ id: z.string(), nameWithOwner: z.string(), pullRequests: connection })
  .nullable();

export interface RepositoryPullRequests {
  pullRequests: PullRequestNode[];
  rateLimit?: RateLimitSnapshot;
}

/**
 * Fetches every open pull request across the given repositories.
 *
 * This is the repo-wide path: it deliberately does not filter by user. One
 * installation sync produces the data every ghspace user in that organisation
 * reads, instead of each of them spending their own rate limit asking a
 * near-identical question.
 */
export async function fetchOpenPullRequests(
  client: GitHubClient,
  repos: RepoRef[],
  /** Called after each batch, so a long fetch can report progress. */
  onProgress?: (done: number, total: number, found: number) => void,
): Promise<RepositoryPullRequests> {
  const pullRequests: PullRequestNode[] = [];
  let rateLimit: RateLimitSnapshot | undefined;

  const record = (snapshot: RateLimitSnapshot | undefined) => {
    // Keep the lowest remaining budget seen, so the figure reported reflects
    // the worst point of the run rather than whichever call finished last.
    if (snapshot && (!rateLimit || snapshot.remaining < rateLimit.remaining)) {
      rateLimit = snapshot;
    }
  };

  const collect = (nodes: unknown[]) => {
    for (const node of nodes) {
      const parsed = prNode.safeParse(node);

      if (parsed.success) pullRequests.push(parsed.data);
    }
  };

  for (let offset = 0; offset < repos.length; offset += REPOS_PER_QUERY) {
    const batch = repos.slice(offset, offset + REPOS_PER_QUERY);
    const variables: Record<string, string> = {};
    batch.forEach((repo, i) => {
      variables[`owner${i}`] = repo.owner;
      variables[`name${i}`] = repo.name;
    });

    const raw = await graphqlAllowingPartial<Record<string, unknown>>(
      client,
      buildBatchQuery(batch.length),
      variables,
      { repositories: batch.map((r) => `${r.owner}/${r.name}`) },
    );

    record(toRateLimitSnapshot(raw.rateLimit));

    for (let i = 0; i < batch.length; i++) {
      // A repository can disappear between listing and querying (deleted, or
      // access revoked), in which case GraphQL returns null for that alias.
      const parsed = repoResult.safeParse(raw[`r${i}`]);

      if (!parsed.success || parsed.data === null) continue;

      const { pullRequests: connectionData } = parsed.data;
      collect(connectionData.nodes);

      if (connectionData.pageInfo.hasNextPage && connectionData.pageInfo.endCursor) {
        const repo = batch[i]!;

        const extra = await paginateRepository(
          client,
          repo,
          connectionData.pageInfo.endCursor,
          record,
        );

        pullRequests.push(...extra);
      }
    }

    onProgress?.(Math.min(offset + batch.length, repos.length), repos.length, pullRequests.length);
  }

  return { pullRequests, rateLimit };
}

/**
 * Follow-up pages for a repository with more open PRs than one page holds.
 * Split out so the common case — the overwhelming majority of repositories,
 * which fit in a single page — stays a pure batch with no extra requests.
 */
async function paginateRepository(
  client: GitHubClient,
  repo: RepoRef,
  startCursor: string,
  record: (snapshot: RateLimitSnapshot | undefined) => void,
): Promise<PullRequestNode[]> {
  const collected: PullRequestNode[] = [];
  let after: string | null = startCursor;

  for (let page = 0; page < MAX_PAGES_PER_REPO && after; page++) {
    const raw = await graphqlAllowingPartial<Record<string, unknown>>(
      client,
      SINGLE_REPO_QUERY,
      { owner: repo.owner, name: repo.name, after },
      { repository: `${repo.owner}/${repo.name}` },
    );

    record(toRateLimitSnapshot(raw.rateLimit));

    const parsed = repoResult.safeParse(
      (raw.repository as Record<string, unknown> | null) === null
        ? null
        : { id: "", nameWithOwner: "", ...(raw.repository as object) },
    );

    if (!parsed.success || parsed.data === null) break;

    for (const node of parsed.data.pullRequests.nodes) {
      const pr = prNode.safeParse(node);

      if (pr.success) collected.push(pr.data);
    }

    const info = parsed.data.pullRequests.pageInfo;
    after = info.hasNextPage ? (info.endCursor ?? null) : null;

    if (after && page === MAX_PAGES_PER_REPO - 1) {
      log.warn("repository has more open pull requests than the page ceiling allows", {
        repository: `${repo.owner}/${repo.name}`,
        ceiling: PAGE_SIZE * (MAX_PAGES_PER_REPO + 1),
        totalCount: parsed.data.pullRequests.totalCount,
      });
    }
  }

  return collected;
}
