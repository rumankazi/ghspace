import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import type { EndpointDefaults } from "@octokit/types";
import { env } from "../env.ts";
import { log } from "../lib/logger.ts";
import type { GitHubClient } from "./client.ts";

const AppOctokit = Octokit.plugin(throttling, retry);

/**
 * `.env` cannot hold a multi-line value cleanly, so the private key is normally
 * supplied base64-encoded. A raw PEM is accepted too, for deployments that can
 * mount the file contents directly.
 */
function privateKey(): string {
  const configured = env().GH_APP_PRIVATE_KEY;
  if (configured.includes("-----BEGIN")) return configured;

  const decoded = Buffer.from(configured, "base64").toString("utf8");
  if (!decoded.includes("-----BEGIN")) {
    throw new Error(
      "GH_APP_PRIVATE_KEY is neither a PEM nor base64-encoded PEM. Encode your .pem with: base64 -i app.private-key.pem",
    );
  }
  return decoded;
}

/**
 * A client authenticated as one installation of the app.
 *
 * This is the main data path. An installation token carries a rate limit
 * dedicated to that installation (5,000/hour, scaling with account size) rather
 * than sharing a user's pool, and it works with nobody signed in — which is
 * also what makes it the right token for webhook-driven refreshes later.
 *
 * Token minting, caching and renewal are handled by `createAppAuth`; the token
 * itself never needs to be stored.
 */
export function createInstallationClient(
  installationId: number,
  apiBaseUrl?: string,
): GitHubClient {
  const baseUrl = apiBaseUrl ?? env().GH_API_BASE_URL;

  return new AppOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env().GH_APP_ID,
      privateKey: privateKey(),
      installationId,
    },
    baseUrl,
    userAgent: "ghspace",
    request: { timeout: 30_000 },
    retry: { doNotRetry: [400, 401, 403, 404, 422] },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        requestOptions: Required<EndpointDefaults>,
        _octokit: unknown,
        retryCount: number,
      ) => {
        log.warn("installation hit primary rate limit", {
          installationId,
          url: requestOptions.url,
          retryAfter,
          retryCount,
        });
        return retryCount < 2;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        requestOptions: Required<EndpointDefaults>,
        _octokit: unknown,
        retryCount: number,
      ) => {
        log.warn("installation hit secondary rate limit", {
          installationId,
          url: requestOptions.url,
          retryAfter,
          retryCount,
        });
        return retryCount < 3;
      },
    },
  }) as unknown as GitHubClient;
}
