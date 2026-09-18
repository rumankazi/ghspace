import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

let pool: Pool | undefined;

function poolMax(): number {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
}

/**
 * Reads `DATABASE_URL` directly rather than through `env()`. Connecting to
 * Postgres depends on one variable, and routing it through the full schema
 * would make unrelated settings — GitHub App credentials, for instance —
 * prerequisites for running a migration.
 *
 * `env()` still lists `DATABASE_URL`, so a misconfigured deployment is caught
 * at startup either way.
 */
function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  pool = new Pool({
    connectionString,
    /**
     * Sized for the deployment rather than hardcoded.
     *
     * A long-running process (self-hosted, Fly, Railway) holds one pool and can
     * afford 10. A serverless deployment holds one pool *per function
     * instance*, so concurrent invocations multiply this — there it must be 1
     * or 2, behind a transaction-mode connection pooler.
     */
    max: poolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // A pool-level error (e.g. the database restarting) must not take the
  // process down; the pool replaces the broken client on the next checkout.
  pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", message: "pg pool error", err: err.message }));
  });
  return pool;
}

export type Database = ReturnType<typeof createDb>;

/**
 * The handle passed to a `db().transaction(...)` callback. Sync code takes this
 * rather than `Database` so it cannot accidentally run outside the transaction
 * that makes a snapshot atomic.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function createDb() {
  return drizzle(getPool(), { schema, casing: "snake_case" });
}

let cached: Database | undefined;

export function db(): Database {
  cached ??= createDb();
  return cached;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  cached = undefined;
}
