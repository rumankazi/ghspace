import { Octokit } from "@octokit/core";
import type { EndpointDefaults } from "@octokit/types";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { env } from "../env.ts";
import { log } from "../lib/logger.ts";

/**
 * Octokit's throttling and retry plugins are doing the heavy lifting for rate
 * limit safety: they read `retry-after` / `x-ratelimit-reset`, serialise
 * requests per-endpoint, and back off on secondary limits. Hand-rolling this
 * gets the abuse-detection cases subtly wrong, so we configure rather than
 * reimplement it.
 */
const ThrottledOctokit = Octokit.plugin(throttling, retry);

export type GitHubClient = InstanceType<typeof ThrottledOctokit>;

export interface RateLimitSnapshot {
  cost: number;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export interface CreateClientOptions {
  /** A user-to-server access token. */
  token: string;
  /** Overridden per-user so GitHub Enterprise Server works unchanged. */
  apiBaseUrl?: string;
  /** Included in throttle logs so a noisy account is identifiable. */
  userLogin?: string;
}

export function createGitHubClient(options: CreateClientOptions): GitHubClient {
  const { token, userLogin } = options;
  const baseUrl = options.apiBaseUrl ?? env().GITHUB_API_BASE_URL;

  return new ThrottledOctokit({
    auth: token,
    baseUrl,
    userAgent: "ghspace",
    request: { timeout: 20_000 },
    retry: { doNotRetry: [400, 401, 403, 404, 422] },
    throttle: {
      /**
       * Primary rate limit. Retrying twice covers a short reset window; beyond
       * that we give up and let the sync run fail, leaving the previous cached
       * data in place rather than blocking for a full hour.
       */
      onRateLimit: (
        retryAfter: number,
        requestOptions: Required<EndpointDefaults>,
        _octokit: unknown,
        retryCount: number,
      ) => {
        log.warn("github primary rate limit hit", {
          method: requestOptions.method,
          url: requestOptions.url,
          retryAfter,
          retryCount,
          userLogin,
        });
        return retryCount < 2;
      },
      /**
       * Secondary limits are abuse detection rather than a quota, so they clear
       * quickly and are worth waiting out.
       */
      onSecondaryRateLimit: (
        retryAfter: number,
        requestOptions: Required<EndpointDefaults>,
        _octokit: unknown,
        retryCount: number,
      ) => {
        log.warn("github secondary rate limit hit", {
          method: requestOptions.method,
          url: requestOptions.url,
          retryAfter,
          retryCount,
          userLogin,
        });
        return retryCount < 3;
      },
    },
  });
}

/** Normalises the `rateLimit` block every GraphQL query asks for. */
export function toRateLimitSnapshot(raw: unknown): RateLimitSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.resetAt !== "string") return undefined;
  return {
    cost: Number(r.cost ?? 0),
    remaining: Number(r.remaining ?? 0),
    limit: Number(r.limit ?? 0),
    resetAt: new Date(r.resetAt),
  };
}
