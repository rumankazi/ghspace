import type { Transaction } from "../db/client.ts";
import { repositories } from "../db/schema.ts";
import { sqlExcluded } from "../db/sql.ts";
import type { ListedRepository } from "../github/repo-listing.ts";

/**
 * Writes the repository rows for a set of repositories.
 *
 * Both sync paths write the same repository facts, and they have to write them
 * the same way: a repository that was renamed or transferred must refresh
 * identically whichever sync ran last, or the cache disagrees with itself.
 *
 * Two columns belong to the installation sync alone. `installation_id` says
 * which installation's token fetches this repository's pull requests, and
 * `synced_at` is the marker the installation sync uses to spot repositories
 * that have left the installation. The access sync leaves both alone: a row it
 * creates belongs to no installation yet, and advancing `synced_at` from that
 * path would keep a repository the installation has dropped alive.
 */
export async function upsertRepositories(
  tx: Transaction,
  repos: ListedRepository[],
  options: { syncedAt: Date; installationId?: string },
): Promise<{ id: string; nodeId: string }[]> {
  const { syncedAt, installationId } = options;
  const ownedByInstallation = installationId !== undefined;

  const values = repos.map((repo) => {
    const facts = {
      nodeId: repo.nodeId,
      owner: repo.owner,
      name: repo.name,
      nameWithOwner: repo.nameWithOwner,
      isPrivate: repo.isPrivate,
      isArchived: repo.isArchived,
      url: repo.url,
      syncedAt,
    };

    if (!ownedByInstallation) return facts;

    return { ...facts, installationId };
  });

  const facts = {
    owner: sqlExcluded("owner"),
    name: sqlExcluded("name"),
    nameWithOwner: sqlExcluded("name_with_owner"),
    isPrivate: sqlExcluded("is_private"),
    isArchived: sqlExcluded("is_archived"),
    url: sqlExcluded("url"),
  };

  const set = ownedByInstallation
    ? {
        ...facts,
        installationId: sqlExcluded("installation_id"),
        syncedAt,
      }
    : facts;

  return tx
    .insert(repositories)
    .values(values)
    .onConflictDoUpdate({ target: repositories.nodeId, set })
    .returning({ id: repositories.id, nodeId: repositories.nodeId });
}
