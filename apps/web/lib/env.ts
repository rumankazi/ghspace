import "server-only";

/**
 * Web-only configuration. Everything shared with the worker lives in
 * `@ghspace/core`'s `env()`; this covers the two values only the HTTP layer
 * needs.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function sessionSecret(): string {
  return required("SESSION_SECRET");
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Whether the seeded development sign-in is available.
 *
 * Two independent conditions, on purpose: an explicit opt-in flag *and* a
 * non-production build. Either one alone would be a single misconfiguration
 * away from an unauthenticated sign-in endpoint on a real deployment.
 */
export function devLoginEnabled(): boolean {
  return process.env.ALLOW_DEV_LOGIN === "1" && !isProduction;
}

/** GitHub's web host. Overridden for GitHub Enterprise Server. */
function githubWebBaseUrl(): string {
  // GitHub rejects secret names beginning with GITHUB_, so GH_ is canonical.
  return process.env.GH_WEB_BASE_URL ?? process.env.GITHUB_WEB_BASE_URL ?? "https://github.com";
}

/**
 * Whether an install link can be built at all. Separate from `installUrl` so a
 * component can explain a missing `GH_APP_SLUG` rather than silently rendering
 * nothing — an invisible control reads as a missing feature, not a
 * misconfiguration.
 */
export function installConfigured(): boolean {
  return installUrl() !== null;
}

/**
 * Where a user goes to install the app on another account. Null until the app
 * slug is configured.
 *
 * `state` is threaded through because GitHub returns it to the callback after
 * the install, which is what keeps a site-initiated install CSRF-protected.
 * Nothing should link here directly — `/api/auth/install` issues the state and
 * redirects, so every entry point gets that protection.
 */
export function installUrl(state?: string): string | null {
  const slug = process.env.GH_APP_SLUG ?? process.env.GITHUB_APP_SLUG;
  if (!slug || slug === "placeholder") return null;

  const url = new URL(`${githubWebBaseUrl()}/apps/${slug}/installations/new`);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
