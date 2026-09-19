import type { DashboardPullRequest } from "@ghspace/core";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CheckCircle2,
  CircleDot,
  GitPullRequestDraft,
  Lock,
  MessageSquare,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Why this pull request concerns the viewer. Null in the browse view, where a
 * pull request need not involve them at all — there the author is the more
 * useful thing to show.
 */
function reasonLabel(reason: DashboardPullRequest["reason"]): string | null {
  if (!reason) return null;

  if (reason.isReviewRequested) return "Review requested";

  if (reason.isAuthor) return "You opened this";

  if (reason.isAssigned) return "Assigned to you";

  if (reason.hasReviewed) return "You reviewed";

  if (reason.isMentioned) return "You were mentioned";

  return null;
}

function ChecksIndicator({ state }: { state: string | null }) {
  if (state === null) return null;

  if (state === "SUCCESS") {
    return (
      <span className="text-success inline-flex items-center gap-1" title="All checks passed">
        <CheckCircle2 className="size-3.5" aria-hidden />
        <span className="sr-only">All checks passed</span>
      </span>
    );
  }

  if (state === "FAILURE" || state === "ERROR") {
    return (
      <span className="text-destructive inline-flex items-center gap-1" title="Checks failing">
        <XCircle className="size-3.5" aria-hidden />
        <span className="sr-only">Checks failing</span>
      </span>
    );
  }

  return (
    <span className="text-warning inline-flex items-center gap-1" title="Checks running">
      <CircleDot className="size-3.5" aria-hidden />
      <span className="sr-only">Checks running</span>
    </span>
  );
}

const REVIEW_LABELS: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Approved", className: "text-success" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "text-destructive" },
  REVIEW_REQUIRED: { label: "Review required", className: "text-muted-foreground" },
};

/**
 * `showRepository` is false under a repository heading on the browse view,
 * where repeating the name on every row says nothing the header has not.
 */
export function PullRequestCard({
  pr,
  showRepository = true,
}: {
  pr: DashboardPullRequest;
  showRepository?: boolean;
}) {
  const review = pr.reviewDecision ? REVIEW_LABELS[pr.reviewDecision] : undefined;

  const reviewers = [
    ...pr.pendingReviewers.map((r) => ({ ...r, pending: true })),
    ...pr.reviewers.map((r) => ({ ...r, isTeam: false, pending: false })),
  ].slice(0, 5);

  const reason = reasonLabel(pr.reason);

  return (
    <li className="hover:bg-accent/40 group relative flex gap-3 px-4 py-3 transition-colors">
      <Avatar className="mt-0.5 size-6 shrink-0">
        {pr.author.avatarUrl ? (
          <AvatarImage src={pr.author.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-[10px]">
          {(pr.author.login ?? "?").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            // Stretched link: the whole row is the click target, but the
            // accessible name stays just the title.
            className="after:absolute after:inset-0 text-sm font-medium hover:underline"
          >
            {pr.title}
          </a>
          {pr.isDraft ? (
            <GitPullRequestDraft
              className="text-muted-foreground size-3.5 shrink-0"
              aria-label="Draft"
            />
          ) : null}
        </div>

        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 font-mono">
            {showRepository ? (
              <>
                {pr.repository.isPrivate ? <Lock className="size-3" aria-label="Private" /> : null}
                {pr.repository.nameWithOwner}
              </>
            ) : null}
            <span className="opacity-60">#{pr.number}</span>
          </span>

          <span aria-hidden>·</span>
          <span>{reason ?? `by ${pr.author.login ?? "unknown"}`}</span>

          <span aria-hidden>·</span>
          <time dateTime={pr.updatedAt.toISOString()}>
            {formatDistanceToNowStrict(pr.updatedAt, { addSuffix: true })}
          </time>

          {review ? (
            <>
              <span aria-hidden>·</span>
              <span className={review.className}>{review.label}</span>
            </>
          ) : null}

          {pr.mergeable === "CONFLICTING" ? (
            <>
              <span aria-hidden>·</span>
              <span className="text-destructive inline-flex items-center gap-1">
                <TriangleAlert className="size-3" aria-hidden />
                Conflicts
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
        {reviewers.length > 0 ? (
          <div className="hidden -space-x-1.5 sm:flex">
            {reviewers.map((reviewer) => (
              <Avatar
                key={`${reviewer.login}-${reviewer.pending}`}
                className={cn(
                  "ring-background size-5 ring-2",
                  reviewer.pending && "opacity-50",
                )}
                title={`${reviewer.login}${reviewer.pending ? " (review pending)" : ""}`}
              >
                {reviewer.avatarUrl ? <AvatarImage src={reviewer.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[9px]">
                  {reviewer.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        ) : null}

        {pr.commentCount > 0 ? (
          <span className="hidden items-center gap-1 sm:inline-flex">
            <MessageSquare className="size-3" aria-hidden />
            {pr.commentCount}
          </span>
        ) : null}

        <span className="hidden font-mono md:inline">
          <span className="text-success">+{pr.additions}</span>{" "}
          <span className="text-destructive">−{pr.deletions}</span>
        </span>

        <ChecksIndicator state={pr.checksState} />
      </div>
    </li>
  );
}
