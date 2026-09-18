import { describe, expect, test } from "bun:test";
import { prNode } from "../src/github/pull-request-fields.ts";

/**
 * GitHub answers a partly-forbidden query with data *and* errors. The commonest
 * case by far is a head commit the installation may not read, which arrives as
 * `commits.nodes: [null]`. Both of those shapes have to survive parsing, or a
 * pull request disappears from the dashboard over a missing CI verdict.
 */
function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "PR_abc",
    number: 23,
    title: "deps: update Node.js to v22.21.1",
    url: "https://github.com/acme/repo/pull/23",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-10T10:00:00Z",
    updatedAt: "2026-09-17T10:00:00Z",
    additions: 4,
    deletions: 4,
    changedFiles: 1,
    reviewDecision: null,
    mergeable: "MERGEABLE",
    author: { login: "renovate", avatarUrl: "https://example.test/a.png" },
    comments: { totalCount: 0 },
    repository: {
      id: "R_abc",
      name: "repo",
      nameWithOwner: "acme/repo",
      isPrivate: true,
      url: "https://github.com/acme/repo",
      owner: { login: "acme" },
    },
    ...overrides,
  };
}

describe("pull request parsing under partial GraphQL responses", () => {
  test("keeps the pull request when the head commit is forbidden", () => {
    const parsed = prNode.safeParse(pullRequest({ commits: { nodes: [null] } }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.number).toBe(23);
      expect(parsed.data.commits?.nodes[0]).toBeNull();
    }
  });

  test("keeps the pull request when commits is null outright", () => {
    expect(prNode.safeParse(pullRequest({ commits: null })).success).toBe(true);
  });

  test("keeps the pull request when commits is absent", () => {
    expect(prNode.safeParse(pullRequest()).success).toBe(true);
  });

  test("still reads the rollup when the commit is readable", () => {
    const parsed = prNode.safeParse(
      pullRequest({
        commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commits?.nodes[0]?.commit?.statusCheckRollup?.state).toBe("FAILURE");
    }
  });

  test("a repository with no CI configured parses with a null rollup", () => {
    const parsed = prNode.safeParse(
      pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commits?.nodes[0]?.commit?.statusCheckRollup ?? null).toBeNull();
    }
  });
});
