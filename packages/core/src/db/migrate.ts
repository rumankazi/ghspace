import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, db } from "./client.ts";
import { log } from "../lib/logger.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const available = readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql"));

log.info("applying migrations", {
  database: redact(process.env.DATABASE_URL ?? ""),
  migrations: available.length,
});

const startedAt = Date.now();

try {
  await migrate(db(), { migrationsFolder });
} catch (error) {
  log.error("migration failed", {
    error: error instanceof Error ? error.message : String(error),
    hint: "Is the database running? Try: bun run db:up",
  });
  await closeDb();
  process.exit(1);
}

// Reported rather than assumed: a migration that silently applied nothing looks
// identical to one that worked, and the table count is the cheapest way to tell
// a fresh database from an already-migrated one.
const tables = await db().execute<{ count: string }>(
  sql`select count(*)::text as count from information_schema.tables where table_schema = 'public'`,
);

log.info("migrations applied", {
  tables: Number(tables.rows[0]?.count ?? 0),
  ms: Date.now() - startedAt,
});

await closeDb();
