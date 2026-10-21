import { sql } from "drizzle-orm";

/**
 * `excluded."column"`: the value the row that lost the conflict would have had.
 *
 * Postgres exposes the losing side of an upsert as `excluded`, so refreshing a
 * column from the incoming row is a reference to that other row rather than a
 * second copy of the value.
 */
export function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
