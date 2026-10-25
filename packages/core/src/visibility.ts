import { and, eq, exists, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db/client.ts";
import { userRepositoryAccess } from "./db/schema.ts";

/**
 * Restricts a query to repositories this user may see.
 *
 * **This is the access boundary.** Everything in the cache — pull requests,
 * workflow runs — is fetched with an *installation* token, which can read every
 * repository in the account, including ones a particular ghspace user has no
 * access to. This predicate is the only thing keeping one user's view from
 * showing another team's private work, and a leak looks exactly like a correct
 * result unless you know whose data you are reading.
 *
 * One implementation rather than one per read module, because the second copy
 * is where the two would drift. `repositoryId` is the column of the table being
 * read that points at `repositories` — `pullRequests.repositoryId` on the pull
 * request paths, `repositories.id` when the repository itself is the subject.
 *
 * See CLAUDE.md and `anti-slop/require-visible-to-user`, which fails CI for any
 * read of the pull request table that does not compose this.
 */
export function visibleToUser(userId: string, repositoryId: PgColumn) {
  return exists(
    db()
      .select({ one: sql`1` })
      .from(userRepositoryAccess)
      .where(
        and(
          eq(userRepositoryAccess.userId, userId),
          eq(userRepositoryAccess.repositoryId, repositoryId),
        ),
      ),
  );
}
