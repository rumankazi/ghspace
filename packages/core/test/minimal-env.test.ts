import { describe, expect, test } from "bun:test";

/**
 * Some processes legitimately run with almost no configuration. `db:migrate`
 * needs a database URL and nothing else, and CI runs it deliberately without
 * GitHub App credentials so the job still works on a fork.
 *
 * Any module those processes touch must therefore not pull in the full
 * environment schema. This has regressed three times — `crypto.ts`,
 * `db/client.ts`, and then `logger.ts` — each time surfacing as a list of
 * unrelated "missing variable" errors from a command that needed none of them.
 */
async function withEnv<T>(env: Record<string, string>, work: () => Promise<T>): Promise<T> {
  const saved = process.env;
  // A fresh object rather than deletions: anything left behind would let a
  // module pass here and still fail on a bare CI runner.
  process.env = { ...env } as NodeJS.ProcessEnv;
  try {
    return await work();
  } finally {
    process.env = saved;
  }
}

describe("modules usable with minimal configuration", () => {
  test("logging works with no environment at all", async () => {
    await withEnv({}, async () => {
      const { log } = await import(`../src/lib/logger.ts?bare-${Date.now()}`);
      expect(() => log.info("hello", { a: 1 })).not.toThrow();
      expect(() => log.error("bad")).not.toThrow();
    });
  });

  test("an unrecognised LOG_LEVEL falls back rather than throwing", async () => {
    await withEnv({ LOG_LEVEL: "verbose" }, async () => {
      const { log } = await import(`../src/lib/logger.ts?bad-level-${Date.now()}`);
      expect(() => log.info("still fine")).not.toThrow();
    });
  });

  test("encryption needs only ENCRYPTION_KEY", async () => {
    const { randomBytes } = await import("node:crypto");
    await withEnv({ ENCRYPTION_KEY: randomBytes(32).toString("base64") }, async () => {
      const crypto = await import(`../src/lib/crypto.ts?minimal-${Date.now()}`);
      expect(crypto.decrypt(crypto.encrypt("ghu_token"))).toBe("ghu_token");
    });
  });

  test("the database client needs only DATABASE_URL", async () => {
    await withEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" }, async () => {
      const { db } = await import(`../src/db/client.ts?minimal-${Date.now()}`);
      // Constructing the pool must not demand unrelated configuration. No query
      // is issued, so nothing needs to be listening.
      expect(() => db()).not.toThrow();
    });
  });
});
