import type {
  ChecksState,
  MergeableState,
  PullRequestState,
  ReviewDecision,
  TriageBucket,
} from "../db/schema.ts";

export interface BucketInput {
  isAuthor: boolean;
  /** A *pending* review request — GitHub drops you from the list once you review. */
  isReviewRequested: boolean;
  isAssigned: boolean;
  isDraft: boolean;
  state: PullRequestState;
  reviewDecision: ReviewDecision | null;
  checksState: ChecksState | null;
  mergeable: MergeableState | null;
}

/**
 * Sorts a pull request into the one bucket that best answers "what, if
 * anything, should this person do about it right now".
 *
 * A flat list of involved PRs is no more useful than GitHub's own; the value
 * of the dashboard is this classification, so the rules live in one pure
 * function that is cheap to test and to argue about.
 *
 * Order is significant — the checks run from most to least actionable, and the
 * first match wins.
 */
export function classify(input: BucketInput): TriageBucket {
  // Closed or merged PRs are history. They are only ever stored because the
  // user asked to see them, so they never claim an action bucket.
  if (input.state !== "OPEN") return "watching";

  // Someone is waiting on this person specifically. This is the highest-value
  // signal on the page and outranks everything except the PR not being ready.
  if (input.isReviewRequested && !input.isAuthor && !input.isDraft) {
    return "blocked_on_you";
  }

  if (input.isDraft) {
    // Another person's draft is informational; the author's own draft is work
    // in progress they have chosen not to expose yet.
    return input.isAuthor ? "drafts" : "watching";
  }

  if (input.isAuthor) {
    // Reviewer pushed back, CI is red, or the branch no longer merges: the ball
    // is unambiguously in the author's court.
    if (input.reviewDecision === "CHANGES_REQUESTED") return "needs_your_action";
    if (input.checksState === "FAILURE" || input.checksState === "ERROR") {
      return "needs_your_action";
    }
    if (input.mergeable === "CONFLICTING") return "needs_your_action";

    // Approved and green. `checksState === null` counts as passing because a
    // repo with no CI configured would otherwise never reach this bucket.
    const checksPassing = input.checksState === "SUCCESS" || input.checksState === null;
    if (input.reviewDecision === "APPROVED" && checksPassing && input.mergeable !== "UNKNOWN") {
      return "ready_to_merge";
    }

    // Open, healthy, and waiting on a human other than the author.
    return "blocked_on_others";
  }

  // Assigned without a review request still implies ownership of something.
  if (input.isAssigned) return "needs_your_action";

  // Mentioned, commented, or previously reviewed: worth seeing, not worth doing.
  return "watching";
}

/** Display order of the buckets, most urgent first. */
export const BUCKET_ORDER: readonly TriageBucket[] = [
  "blocked_on_you",
  "needs_your_action",
  "ready_to_merge",
  "blocked_on_others",
  "drafts",
  "watching",
] as const;

export const BUCKET_LABELS: Record<TriageBucket, string> = {
  blocked_on_you: "Blocked on you",
  needs_your_action: "Needs your action",
  ready_to_merge: "Ready to merge",
  blocked_on_others: "Blocked on others",
  drafts: "Your drafts",
  watching: "Watching",
};

export const BUCKET_DESCRIPTIONS: Record<TriageBucket, string> = {
  blocked_on_you: "Your review has been requested and nobody can move without it.",
  needs_your_action: "Changes requested, failing checks, or a merge conflict on your work.",
  ready_to_merge: "Approved, green, and mergeable.",
  blocked_on_others: "Your open pull requests waiting on someone else's review.",
  drafts: "Work in progress you have not opened for review yet.",
  watching: "You are mentioned, assigned, or have already reviewed.",
};
