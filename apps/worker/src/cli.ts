import { closeDb, db, users } from "@ghspace/core/db";
import { log } from "@ghspace/core";
import {
  listInstallationsForSync,
  syncInstallation,
  syncUserAccess,
} from "@ghspace/core/sync";
import { eq } from "drizzle-orm";

/**
 * One-off sync, for when you want to see the effect of a change immediately
 * instead of waiting for the worker's next tick.
 *
 *   bun run sync              # refresh access for every user, then every installation
 *   bun run sync <login>      # refresh one user's access, then every installation
 */
const login = process.argv[2];

const targets = login
  ? await db()
      .select({ id: users.id, login: users.githubLogin })
      .from(users)
      .where(eq(users.githubLogin, login))
  : await db().select({ id: users.id, login: users.githubLogin }).from(users);

if (targets.length === 0) {
  log.error(login ? `no user with login ${login}` : "no users registered");
  await closeDb();
  process.exit(1);
}

// Access first: involvement can only be derived for users whose repository
// access is already known.
for (const target of targets) {
  const access = await syncUserAccess(target.id);
  log.info("access synced", { login: target.login, ...access });
}

for (const installation of await listInstallationsForSync()) {
  const result = await syncInstallation(installation.id);
  log.info("installation synced", {
    installation: installation.accountLogin,
    repositories: result.repositoryCount,
    pullRequests: result.pullRequestCount,
  });
}

await closeDb();
