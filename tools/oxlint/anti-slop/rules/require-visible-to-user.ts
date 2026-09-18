/*
 * GHSPACE-LOCAL RULE — not from upstream anti-slop.
 *
 * Keep this file when merging a newer upstream revision; `references/update.md`
 * treats local-only rules as owned policy rather than drift.
 */
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

/** Drizzle chain methods that name a table as a read source. */
const READ_SOURCE_METHODS = new Set(["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin"]);

const DEFAULT_TABLE = "pullRequests";
const DEFAULT_PREDICATE = "visibleToUser";
const DEFAULT_MARKER = "ACCESS";

interface Options {
	readonly table: string;
	readonly predicate: string;
	readonly marker: string;
}

function stringOption(option: unknown, key: string, fallback: string): string {
	if (typeof option !== "object" || option === null || !(key in option)) return fallback;
	const value = (option as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function options(option: unknown): Options {
	return {
		table: stringOption(option, "table", DEFAULT_TABLE),
		predicate: stringOption(option, "predicate", DEFAULT_PREDICATE),
		marker: stringOption(option, "marker", DEFAULT_MARKER),
	};
}

function markerPattern(marker: string): RegExp {
	const escaped = marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
	return new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])${escaped}\s*:\s*\S`, "u");
}

/** The `.from(table)` / `.innerJoin(table, ...)` call naming `table` as a source. */
function readsTable(node: ESTree.CallExpression, table: string): boolean {
	const callee = node.callee;
	if (callee.type !== "MemberExpression" || callee.computed) return false;
	if (callee.property.type !== "Identifier") return false;
	if (!READ_SOURCE_METHODS.has(callee.property.name)) return false;

	const [first] = node.arguments;
	return first !== undefined && first.type === "Identifier" && first.name === table;
}

type FunctionNode =
	| ESTree.FunctionDeclaration
	| ESTree.FunctionExpression
	| ESTree.ArrowFunctionExpression;

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

/**
 * The function a query belongs to, as a reviewer would read it.
 *
 * Deliberately the *outermost* enclosing function rather than the innermost: a
 * query inside a `Promise.all([...])` callback or a `.map` is still guarded by
 * a predicate composed in the exported function around it.
 */
function enclosingFunction(node: ESTree.Node): FunctionNode | null {
	let current: ESTree.Node | undefined = node.parent;
	let outermost: FunctionNode | null = null;
	while (current !== undefined && current.type !== "Program") {
		if (isFunctionNode(current)) outermost = current;
		current = current.parent;
	}
	return outermost;
}

/**
 * Whether the read is justified by a marker comment.
 *
 * Every ancestor up to the module is checked, not just the nearest statement:
 * the honest place to justify an unscoped read is usually the doc comment on
 * the exported function, which sits several levels above the query itself.
 */
function hasExemptionComment(
	sourceCode: SourceCode,
	node: ESTree.Node,
	pattern: RegExp,
): boolean {
	let current: ESTree.Node | undefined = node;
	while (current !== undefined && current.type !== "Program") {
		const justified = sourceCode
			.getCommentsBefore(current)
			.some((comment) => pattern.test(comment.value));
		if (justified) return true;
		current = current.parent;
	}
	return false;
}

/**
 * Require every read of the pull request table to compose the access predicate.
 *
 * Pull requests are cached with an installation token that can read every
 * repository in the account, so the predicate is the only thing separating one
 * user's dashboard from another team's private work. This rule is scoped to the
 * enclosing function rather than the single `.where()` call, because the guard
 * is legitimately built up in a `conditions` array before being applied.
 *
 * Writes are not matched: `.insert`/`.update`/`.delete` name their table
 * through a different method, and the sync path owns them.
 */
export const requireVisibleToUserRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require reads of the pull request table to compose the per-user visibility predicate.",
		},
		messages: {
			missingPredicate:
				"This reads `{{table}}` without composing `{{predicate}}(userId)` anywhere in the enclosing function. Pull requests are cached with an installation token that reads every repository in the account, so omitting it leaks another team's private work. If this read is deliberately not user-scoped, justify it with a `{{marker}}:` comment.",
		},
	},
	createOnce(context) {
		let queries: ESTree.CallExpression[] = [];
		let predicateRanges: { start: number; end: number }[] = [];

		return {
			Program() {
				queries = [];
				predicateRanges = [];
			},

			CallExpression(node) {
				const { table } = options(context.options?.[0]);
				if (readsTable(node, table)) queries.push(node);
			},

			Identifier(node) {
				const { predicate } = options(context.options?.[0]);
				if (node.name === predicate) predicateRanges.push({ start: node.start, end: node.end });
			},

			"Program:exit"() {
				const { table, predicate, marker } = options(context.options?.[0]);
				const pattern = markerPattern(marker);

				for (const query of queries) {
					const enclosing = enclosingFunction(query);
					const guarded =
						enclosing !== null &&
						predicateRanges.some(
							(range) => range.start >= enclosing.start && range.end <= enclosing.end,
						);
					if (guarded) continue;
					if (hasExemptionComment(context.sourceCode, query, pattern)) continue;

					context.report({
						node: query,
						messageId: "missingPredicate",
						data: { table, predicate, marker },
					});
				}
			},
		};
	},
});
