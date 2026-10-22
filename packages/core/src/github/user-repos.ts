import type { GitHubClient } from "./client.ts";
import { listRepositories, type ListedRepository } from "./repo-listing.ts";

/**
 * The repositories this user can reach through one installation.
 *
 * The same shape as the installation listing: both endpoints return the same
 * repository objects, so the two are one type under the name each call site
 * reads best with.
 */
export type AccessibleRepository = ListedRepository;

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
  return listRepositories(client, "GET /user/installations/{installation_id}/repositories", {
    installation_id: installationId,
  });
}
