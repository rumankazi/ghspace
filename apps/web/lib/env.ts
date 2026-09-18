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

/**
 * Where a user goes to install the app on another account. Null until the app
 * slug is configured, so the UI can hide the control rather than offer a broken
 * link.
 */
export function installUrl(): string | null {
  // GitHub rejects secret names beginning with GITHUB_, so GH_ is canonical.
  const slug = process.env.GH_APP_SLUG ?? process.env.GITHUB_APP_SLUG;
  if (!slug || slug === "placeholder") return null;
  return `https://github.com/apps/${slug}/installations/new`;
}
