import { describe, expect, test } from "bun:test";
import { BUCKET_ORDER, classify, type BucketInput } from "../src/sync/buckets.ts";

function input(overrides: Partial<BucketInput> = {}): BucketInput {
  return {
    isAuthor: false,
    isReviewRequested: false,
    isAssigned: false,
    isRepositoryOwner: false,
    authorIsBot: false,
    isDraft: false,
    state: "OPEN",
    reviewDecision: null,
    checksState: null,
    mergeable: "MERGEABLE",
    ...overrides,
  };
}

describe("classify", () => {
  test("a pending review request outranks every other signal", () => {
    expect(
      classify(
        input({
          isReviewRequested: true,
          isAssigned: true,
          checksState: "FAILURE",
          mergeable: "CONFLICTING",
        }),
      ),
    ).toBe("blocked_on_you");
  });

  test("the author is never blocked on their own review request", () => {
    expect(classify(input({ isAuthor: true, isReviewRequested: true }))).toBe(
      "blocked_on_others",
    );
  });

  test("a draft is not ready for anyone, even with a review requested", () => {
    expect(classify(input({ isReviewRequested: true, isDraft: true }))).toBe("watching");
    expect(classify(input({ isAuthor: true, isDraft: true }))).toBe("drafts");
    expect(classify(input({ isDraft: true }))).toBe("watching");
  });

  describe("the author's own open pull requests", () => {
    const author = (o: Partial<BucketInput> = {}) => classify(input({ isAuthor: true, ...o }));

    test("changes requested puts the ball back in the author's court", () => {
      expect(author({ reviewDecision: "CHANGES_REQUESTED" })).toBe("needs_your_action");
    });

    test("red or errored checks need the author", () => {
      expect(author({ checksState: "FAILURE" })).toBe("needs_your_action");
      expect(author({ checksState: "ERROR" })).toBe("needs_your_action");
    });

    test("a merge conflict needs the author even when approved and green", () => {
      expect(
        author({ reviewDecision: "APPROVED", checksState: "SUCCESS", mergeable: "CONFLICTING" }),
      ).toBe("needs_your_action");
    });

    test("approved and green is ready to merge", () => {
      expect(author({ reviewDecision: "APPROVED", checksState: "SUCCESS" })).toBe(
        "ready_to_merge",
      );
    });

    test("a repo with no CI still reaches ready_to_merge once approved", () => {
      expect(author({ reviewDecision: "APPROVED", checksState: null })).toBe("ready_to_merge");
    });

    test("approved but still running checks is not ready yet", () => {
      expect(author({ reviewDecision: "APPROVED", checksState: "PENDING" })).toBe(
        "blocked_on_others",
      );
    });

    test("an unknown mergeable state is not treated as mergeable", () => {
      expect(
        author({ reviewDecision: "APPROVED", checksState: "SUCCESS", mergeable: "UNKNOWN" }),
      ).toBe("blocked_on_others");
    });

    test("awaiting a first review is blocked on others", () => {
      expect(author({ reviewDecision: "REVIEW_REQUIRED" })).toBe("blocked_on_others");
      expect(author()).toBe("blocked_on_others");
    });
  });

  test("assignment without a review request still implies ownership", () => {
    expect(classify(input({ isAssigned: true }))).toBe("needs_your_action");
  });

  test("a bare mention is only worth watching", () => {
    expect(classify(input())).toBe("watching");
  });

  test("closed and merged pull requests never claim an action bucket", () => {
    for (const state of ["CLOSED", "MERGED"] as const) {
      expect(classify(input({ state, isAuthor: true, checksState: "FAILURE" }))).toBe("watching");
      expect(classify(input({ state, isReviewRequested: true }))).toBe("watching");
    }
  });

  describe("repositories you own", () => {
    test("a bot's dependency bump becomes its own bucket", () => {
      expect(classify(input({ isRepositoryOwner: true, authorIsBot: true }))).toBe(
        "dependency_updates",
      );
    });

    test("a failing bot bump stays in the dependency bucket", () => {
      // Grouping beats severity here: the whole point is to keep a large,
      // uniform queue out of the buckets that represent real decisions.
      expect(
        classify(input({ isRepositoryOwner: true, authorIsBot: true, checksState: "FAILURE" })),
      ).toBe("dependency_updates");
    });

    test("an automated review request does not promote a bump out of the bucket", () => {
      // Renovate and Dependabot are routinely configured with `reviewers:` and
      // `assignees:`, so honouring those would funnel the whole dependency
      // queue into "Blocked on you" — which is the separation this bucket
      // exists to provide.
      expect(
        classify(
          input({ isRepositoryOwner: true, authorIsBot: true, isReviewRequested: true }),
        ),
      ).toBe("dependency_updates");
      expect(
        classify(input({ isRepositoryOwner: true, authorIsBot: true, isAssigned: true })),
      ).toBe("dependency_updates");
    });

    test("a human review request elsewhere is untouched by that rule", () => {
      expect(
        classify(input({ isRepositoryOwner: false, authorIsBot: false, isReviewRequested: true })),
      ).toBe("blocked_on_you");
    });

    test("a bot pull request elsewhere is not yours to merge", () => {
      expect(classify(input({ isRepositoryOwner: false, authorIsBot: true }))).toBe("watching");
    });

    test("your own pull request in your own repository follows the normal rules", () => {
      expect(
        classify(
          input({
            isRepositoryOwner: true,
            isAuthor: true,
            reviewDecision: "APPROVED",
            checksState: "SUCCESS",
          }),
        ),
      ).toBe("ready_to_merge");
    });

    test("a person's pull request on your repository is waiting on you", () => {
      expect(classify(input({ isRepositoryOwner: true, authorIsBot: false }))).toBe(
        "blocked_on_you",
      );
    });

    test("a closed bot bump is history, not a queue item", () => {
      expect(
        classify(input({ isRepositoryOwner: true, authorIsBot: true, state: "MERGED" })),
      ).toBe("watching");
    });
  });

  test("every reachable bucket is present in the display order", () => {
    expect(new Set(BUCKET_ORDER).size).toBe(BUCKET_ORDER.length);

    const reachable = new Set([
      classify(input({ isReviewRequested: true })),
      classify(input({ isAuthor: true, isDraft: true })),
      classify(input({ isAuthor: true, reviewDecision: "CHANGES_REQUESTED" })),
      classify(input({ isAuthor: true, reviewDecision: "APPROVED", checksState: "SUCCESS" })),
      classify(input({ isAuthor: true })),
      classify(input({ isRepositoryOwner: true, authorIsBot: true })),
      classify(input()),
    ]);

    for (const bucket of reachable) expect(BUCKET_ORDER).toContain(bucket);
    expect(reachable.size).toBe(BUCKET_ORDER.length);
  });
});
