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

/**
 * The incoming value, or the stored one when the incoming value is null.
 *
 * For a column that only some writers know about. A listing that omits the
 * field would otherwise erase what a listing that carries it already wrote,
 * and the erasure is invisible: the column is nullable either way.
 */
export function sqlExcludedOrKeep(table: string, column: string) {
  return sql.raw(`coalesce(excluded."${column}", "${table}"."${column}")`);
}
