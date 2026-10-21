import { z } from "zod";
import type { GitHubClient } from "./client.ts";

/**
 * The repository listing, and the shape both listings share.
 *
 * `GET /installation/repositories` and
 * `GET /user/installations/{installation_id}/repositories` return the same
 * repository objects in the same envelope. One schema parses both, so the two
 * cannot drift apart — and drift between them is the kind that only shows up
 * once one endpoint starts sending a field the other does not.
 */
const listedRepo = z.object({
  // The installation listing sends a numeric id and the per-user listing
  // sends it too. Neither reads it, so it stays optional: a field nothing
  // reads should not be able to fail a whole sync.
  id: z.number().optional(),
  node_id: z.string(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  archived: z.boolean().optional().default(false),
  html_url: z.string(),
  owner: z.object({ login: z.string(), avatar_url: z.string().optional() }),
});

const listedRepoPage = z.object({
  total_count: z.number(),
  repositories: z.array(listedRepo),
});

/**
 * The repository facts ghspace keeps, whichever listing they came from.
 */
export interface ListedRepository {
  nodeId: string;
  owner: string;
  name: string;
  nameWithOwner: string;
  isPrivate: boolean;
  isArchived: boolean;
  url: string;
}

/** The two endpoints that list the repositories of an installation. */
type RepositoryListingRoute =
  | "GET /installation/repositories"
  | "GET /user/installations/{installation_id}/repositories";

export async function listRepositories(
  client: GitHubClient,
  route: "GET /installation/repositories",
  params?: { installation_id?: never },
): Promise<ListedRepository[]>;
export async function listRepositories(
  client: GitHubClient,
  route: "GET /user/installations/{installation_id}/repositories",
  params: { installation_id: number },
): Promise<ListedRepository[]>;
/**
 * Lists every repository an installation can reach, paging until GitHub says
 * there are no more.
 *
 * One function for both listings because the paging, the parsing and the
 * mapping are the same work; only the endpoint differs.
 */
export async function listRepositories(
  client: GitHubClient,
  route: RepositoryListingRoute,
  params: { installation_id?: number } = {},
): Promise<ListedRepository[]> {
  const results: ListedRepository[] = [];

  for (let page = 1; ; page++) {
    const raw = await client.request(route, { ...params, per_page: 100, page });
    const parsed = listedRepoPage.parse(raw.data);

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
