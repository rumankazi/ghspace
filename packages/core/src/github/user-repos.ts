import { z } from "zod";
import type { GitHubClient } from "./client.ts";

const repo = z.object({
  node_id: z.string(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  archived: z.boolean().optional().default(false),
  html_url: z.string(),
  owner: z.object({ login: z.string() }),
});

const response = z.object({
  total_count: z.number(),
  repositories: z.array(repo),
});

export interface AccessibleRepository {
  nodeId: string;
  owner: string;
  name: string;
  nameWithOwner: string;
  isPrivate: boolean;
  isArchived: boolean;
  url: string;
}

/**
 * The repositories a specific user can reach through one installation, read
 * with that user's own token.
 *
 * This is the security half of the installation-first design. Pull requests are
 * fetched with an installation token that can see every repository in the
 * account; this call is the only thing that knows which of them *this* person
 * is entitled to, and its result is what every read path filters against.
 */
export async function listAccessibleRepositories(
  client: GitHubClient,
  installationId: number,
): Promise<AccessibleRepository[]> {
  const results: AccessibleRepository[] = [];

  for (let page = 1; ; page++) {
    const raw = await client.request(
      "GET /user/installations/{installation_id}/repositories",
      { installation_id: installationId, per_page: 100, page },
    );
    const parsed = response.parse(raw.data);

    for (const entry of parsed.repositories) {
      results.push({
        nodeId: entry.node_id,
        owner: entry.owner.login,
        name: entry.name,
        nameWithOwner: entry.full_name,
        isPrivate: entry.private,
        isArchived: entry.archived,
        url: entry.html_url,
      });
    }

    if (results.length >= parsed.total_count || parsed.repositories.length === 0) break;
  }

  return results;
}
