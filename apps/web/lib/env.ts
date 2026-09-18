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
 * Where a user goes to install the app on another account. Null until the app
 * slug is configured, so the UI can hide the control rather than offer a broken
 * link.
 */
export function installUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug || slug === "placeholder") return null;
  return `https://github.com/apps/${slug}/installations/new`;
}
