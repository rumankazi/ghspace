/*
 * GHSPACE-LOCAL TEST — not from upstream anti-slop. Keep it when merging.
 *
 * `@oxlint/plugins@1.83.0` ships no RuleTester, so the rule is exercised the
 * only way available: through the real Oxlint CLI, against a fixture written to
 * a temporary directory. Running it outside the repository keeps the
 * repository's own `ignorePatterns` from silently skipping the fixture and
 * turning this into a test that passes by linting nothing.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

const FIXTURE = `
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { pullRequests, repositories, userRepositoryAccess } from "./schema.ts";

function visibleToUser(userId: string) {
	return exists(
		db().select({ one: sql\`1\` }).from(userRepositoryAccess).where(eq(userRepositoryAccess.userId, userId)),
	);
}

export async function unguarded() {
	return db().select().from(pullRequests);
}

export async function guardedByTheWrongThing(userId: string) {
	return db().select().from(pullRequests).where(eq(pullRequests.authorLogin, userId));
}

export async function unguardedJoin() {
	return db().select().from(repositories).innerJoin(pullRequests, eq(pullRequests.repositoryId, repositories.id));
}

export async function guarded(userId: string) {
	return db().select().from(pullRequests).where(visibleToUser(userId));
}

export async function guardedViaConditionsArray(userId: string, ids: string[]) {
	const conditions = [visibleToUser(userId)];
	if (ids.length > 0) conditions.push(inArray(pullRequests.repositoryId, ids));
	return db().select().from(pullRequests).where(and(...conditions));
}

export async function guardedAcrossACallback(userId: string) {
	const where = visibleToUser(userId);
	const [rows] = await Promise.all([db().select().from(pullRequests).where(where)]);
	return rows;
}

// ACCESS: runs in the sync, before any viewer exists.
export async function justifiedSyncRead(ids: string[]) {
	return db().select().from(pullRequests).where(inArray(pullRequests.repositoryId, ids));
}

export async function writesAreNotReads() {
	return db().delete(pullRequests);
}
`;

/** Line numbers in FIXTURE that must be reported, found by marker rather than by counting. */
function lineOf(needle: string): number {
	const index = FIXTURE.split("\n").findIndex((line) => line.includes(needle));
	if (index === -1) throw new Error(`fixture no longer contains ${needle}`);
	return index + 1;
}

let directory: string;

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "ghspace-visible-to-user-"));
	await writeFile(join(directory, "fixture.ts"), FIXTURE);
	await writeFile(
		join(directory, ".oxlintrc.json"),
		JSON.stringify({
			plugins: [],
			categories: {},
			jsPlugins: [{ name: "anti-slop", specifier: pluginEntry }],
			rules: { "anti-slop/require-visible-to-user": "error" },
		}),
	);
});

afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

async function reportedLines(): Promise<number[]> {
	const result = Bun.spawnSync({
		cmd: [
			join(process.cwd(), "node_modules", ".bin", "oxlint"),
			"--config",
			join(directory, ".oxlintrc.json"),
			"--format",
			"json",
			"fixture.ts",
		],
		cwd: directory,
	});
	const stdout = result.stdout.toString();
	const report: { diagnostics?: { code?: string; labels?: { span?: { line?: number } }[] }[] } =
		JSON.parse(stdout);

	// Oxlint still applies its own default rules to the fixture, so filter by
	// code: an assertion on the total would otherwise count unrelated warnings.
	return (report.diagnostics ?? [])
		.filter((d) => d.code === "anti-slop(require-visible-to-user)")
		.flatMap((d) => {
			const line = d.labels?.[0]?.span?.line;
			return typeof line === "number" ? [line] : [];
		})
		.sort((a, b) => a - b);
}

test("reports every unguarded read of the pull request table", async () => {
	const lines = await reportedLines();

	expect(lines).toContain(lineOf("return db().select().from(pullRequests);"));
	expect(lines).toContain(lineOf("eq(pullRequests.authorLogin, userId)"));
	expect(lines).toContain(lineOf(".innerJoin(pullRequests"));
});

test("accepts reads the predicate guards, however indirectly", async () => {
	const lines = await reportedLines();

	expect(lines).not.toContain(lineOf(".where(visibleToUser(userId))"));
	expect(lines).not.toContain(lineOf("and(...conditions)"));
	expect(lines).not.toContain(lineOf("Promise.all([db().select()"));
});

test("accepts a justified unscoped read and ignores writes", async () => {
	const lines = await reportedLines();

	expect(lines).not.toContain(lineOf("inArray(pullRequests.repositoryId, ids));"));
	expect(lines).not.toContain(lineOf("db().delete(pullRequests)"));
});

test("reports exactly the three unguarded reads and nothing else", async () => {
	const lines = await reportedLines();

	expect(lines).toHaveLength(3);
});
