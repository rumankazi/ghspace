import { z } from "zod";
import type { GitHubClient, RateLimitSnapshot } from "./client.ts";
import { toRateLimitSnapshot } from "./client.ts";
import { PR_FIELDS, prNode, type PullRequestNode } from "./pull-request-fields.ts";
import { log } from "../lib/logger.ts";

const SEARCH_QUERY = /* GraphQL */ `
  ${PR_FIELDS}
  query InvolvedPullRequests($q: String!, $first: Int!, $after: String) {
    rateLimit {
      limit
      cost
      remaining
      resetAt
    }
    search(query: $q, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...PrFields
      }
    }
  }
`;

const searchResponse = z.object({
  rateLimit: z.unknown().optional(),
  search: z.object({
    issueCount: z.number(),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable().optional(),
    }),
    // `search(type: ISSUE)` can return Issues too. Our queries filter with
    // `is:pr`, but the schema types the union loosely, so non-PR nodes are
    // dropped here rather than being allowed to fail the whole page.
    nodes: z.array(z.unknown()),
  }),
});

export interface SearchResult {
  pullRequests: PullRequestNode[];
  rateLimit?: RateLimitSnapshot;
}

/**
 * A user-scoped pull request search, run with that user's own token.
 *
 * **Not used by the main sync**, which fetches repo-wide with an installation
 * token instead. This is kept as the recovery path for the two signals the
 * repo-wide path cannot see, because GitHub only exposes them through search
 * qualifiers:
 *
 *   - `involves:` matches PRs the user commented on or was @-mentioned in
 *   - `review-requested:` matches requests addressed to a *team* the user is in
 *
 * Reach for this only if those signals turn out to matter; it costs a user's
 * own rate limit budget, per user, which is exactly what the installation-first
 * design avoids.
 */
export async function searchPullRequests(
  client: GitHubClient,
  query: string,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<SearchResult> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 4;

  const pullRequests: PullRequestNode[] = [];
  let rateLimit: RateLimitSnapshot | undefined;
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const raw = await client.graphql(SEARCH_QUERY, { q: query, first: pageSize, after });
    const parsed = searchResponse.parse(raw);

    rateLimit = toRateLimitSnapshot(parsed.rateLimit) ?? rateLimit;

    for (const node of parsed.search.nodes) {
      const pr = prNode.safeParse(node);
      if (pr.success) pullRequests.push(pr.data);
    }

    if (!parsed.search.pageInfo.hasNextPage || !parsed.search.pageInfo.endCursor) {
      return { pullRequests, rateLimit };
    }
    after = parsed.search.pageInfo.endCursor;

    if (page === maxPages - 1) {
      log.warn("pull request search truncated at page limit", {
        query,
        maxPages,
        fetched: pullRequests.length,
        totalMatching: parsed.search.issueCount,
      });
    }
  }

  return { pullRequests, rateLimit };
}

const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      databaseId
      login
      name
      email
      avatarUrl
    }
  }
`;

const viewerResponse = z.object({
  viewer: z.object({
    databaseId: z.number(),
    login: z.string(),
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
  }),
});

export type Viewer = z.infer<typeof viewerResponse>["viewer"];

export async function fetchViewer(client: GitHubClient): Promise<Viewer> {
  return viewerResponse.parse(await client.graphql(VIEWER_QUERY)).viewer;
}
