import { z } from "zod";

/**
 * The single definition of "what ghspace knows about a pull request".
 *
 * Two code paths fetch pull requests — a user-scoped search and the repo-wide
 * installation sync — and they must agree on the shape exactly, or the same PR
 * would be cached with different fields depending on which path saw it first.
 * Keeping the fragment and its parser together in one module is what prevents
 * that drift.
 */
export const PR_FIELDS = /* GraphQL */ `
  fragment PrFields on PullRequest {
    id
    number
    title
    url
    state
    isDraft
    createdAt
    updatedAt
    mergedAt
    closedAt
    additions
    deletions
    changedFiles
    reviewDecision
    mergeable
    author {
      login
      avatarUrl
    }
    comments {
      totalCount
    }
    repository {
      id
      name
      nameWithOwner
      isPrivate
      isArchived
      url
      owner {
        login
        avatarUrl
      }
    }
    assignees(first: 20) {
      nodes {
        login
        avatarUrl
      }
    }
    reviewRequests(first: 20) {
      nodes {
        requestedReviewer {
          __typename
          ... on User {
            login
            avatarUrl
          }
          ... on Team {
            slug
          }
        }
      }
    }
    latestReviews(first: 20) {
      nodes {
        id
        state
        submittedAt
        author {
          login
          avatarUrl
        }
      }
    }
    commits(last: 1) {
      nodes {
        commit {
          statusCheckRollup {
            state
          }
        }
      }
    }
  }
`;

const actor = z
  .object({ login: z.string(), avatarUrl: z.string().optional() })
  .nullable()
  .optional();

export const prNode = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  mergedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  additions: z.number().default(0),
  deletions: z.number().default(0),
  changedFiles: z.number().default(0),
  reviewDecision: z
    .enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"])
    .nullable()
    .optional(),
  mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]).nullable().optional(),
  author: actor,
  comments: z.object({ totalCount: z.number() }).optional(),
  repository: z.object({
    id: z.string(),
    name: z.string(),
    nameWithOwner: z.string(),
    isPrivate: z.boolean(),
    isArchived: z.boolean().optional().default(false),
    url: z.string(),
    owner: z.object({ login: z.string(), avatarUrl: z.string().optional() }),
  }),
  assignees: z
    .object({
      nodes: z.array(z.object({ login: z.string(), avatarUrl: z.string().optional() })),
    })
    .optional(),
  reviewRequests: z
    .object({
      nodes: z.array(
        z.object({
          requestedReviewer: z
            .object({
              __typename: z.string(),
              login: z.string().optional(),
              slug: z.string().optional(),
              avatarUrl: z.string().optional(),
            })
            .nullable()
            .optional(),
        }),
      ),
    })
    .optional(),
  latestReviews: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string(),
          state: z.string(),
          submittedAt: z.string().nullable().optional(),
          author: actor,
        }),
      ),
    })
    .optional(),
  commits: z
    .object({
      nodes: z.array(
        z.object({
          commit: z.object({
            statusCheckRollup: z
              .object({
                state: z.enum(["EXPECTED", "ERROR", "FAILURE", "PENDING", "SUCCESS"]),
              })
              .nullable()
              .optional(),
          }),
        }),
      ),
    })
    .optional(),
});

export type PullRequestNode = z.infer<typeof prNode>;
