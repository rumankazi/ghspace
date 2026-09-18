import { z } from "zod";
import type { GitHubClient } from "./client.ts";

/**
 * Installations are a REST-only concept — there is no GraphQL equivalent for
 * `GET /user/installations`, so this is the one place the sync path uses REST.
 * Both calls are cheap and run once per cycle.
 */

const installation = z.object({
  id: z.number(),
  account: z
    .object({
      login: z.string().optional(),
      slug: z.string().optional(),
      type: z.string().optional(),
      avatar_url: z.string().optional(),
    })
    .nullable()
    .optional(),
  repository_selection: z.enum(["all", "selected"]).optional(),
  html_url: z.string().optional(),
  suspended_at: z.string().nullable().optional(),
  app_id: z.number().optional(),
});

const installationsResponse = z.object({
  total_count: z.number(),
  installations: z.array(installation),
});

export interface UserInstallation {
  githubInstallationId: number;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  repositorySelection: "all" | "selected";
  htmlUrl: string | null;
  suspendedAt: Date | null;
  /** Repositories in this installation that this specific user can reach. */
  repositoryCount: number;
}

/**
 * Lists the installations this user can see through, with the number of
 * repositories each one exposes to them.
 *
 * Note this is the *user's* view: two ghspace users in the same org share an
 * installation but may reach different repository counts through it.
 */
export async function fetchUserInstallations(
  client: GitHubClient,
): Promise<UserInstallation[]> {
  const raw = await client.request("GET /user/installations", { per_page: 100 });
  const parsed = installationsResponse.parse(raw.data);

  const results: UserInstallation[] = [];

  for (const entry of parsed.installations) {
    // Organization accounts expose `login`; some account shapes only carry
    // `slug`. Skipping a nameless installation is better than rendering "null".
    const login = entry.account?.login ?? entry.account?.slug;

    if (!login) continue;

    results.push({
      githubInstallationId: entry.id,
      accountLogin: login,
      accountType: entry.account?.type ?? "Organization",
      accountAvatarUrl: entry.account?.avatar_url ?? null,
      repositorySelection: entry.repository_selection ?? "selected",
      htmlUrl: entry.html_url ?? null,
      suspendedAt: entry.suspended_at ? new Date(entry.suspended_at) : null,
      repositoryCount: await countRepositories(client, entry.id),
    });
  }

  return results;
}

const repositoriesResponse = z.object({ total_count: z.number() });

/**
 * `per_page: 1` because only `total_count` is wanted — the repository list
 * itself is never used, and fetching it would turn one cheap call into a
 * paginated crawl of every repo in the org.
 */
async function countRepositories(
  client: GitHubClient,
  installationId: number,
): Promise<number> {
  try {
    const raw = await client.request("GET /user/installations/{installation_id}/repositories", {
      installation_id: installationId,
      per_page: 1,
    });

    return repositoriesResponse.parse(raw.data).total_count;
  } catch {
    // A suspended installation returns 403 here. The installation itself is
    // still worth showing, so report an unknown count rather than failing the
    // whole sync over it.
    return 0;
  }
}
