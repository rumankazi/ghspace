import { z } from "zod";

/**
 * Parsed once at import. Failing loudly at startup beats a `undefined` token
 * surfacing as a confusing 401 from GitHub several layers down.
 */
/**
 * GitHub refuses to store repository secrets whose names begin with `GITHUB_`,
 * so the App credentials cannot be carried under their most obvious names in
 * Actions. `GH_` is the canonical prefix for that reason.
 *
 * The `GITHUB_` spellings are still accepted so that an existing `.env` keeps
 * working; `GH_` wins when both are set.
 */
function preferGh(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const aliases: [canonical: string, legacy: string][] = [
    ["GH_APP_ID", "GITHUB_APP_ID"],
    ["GH_APP_SLUG", "GITHUB_APP_SLUG"],
    ["GH_APP_CLIENT_ID", "GITHUB_APP_CLIENT_ID"],
    ["GH_APP_CLIENT_SECRET", "GITHUB_APP_CLIENT_SECRET"],
    ["GH_APP_PRIVATE_KEY", "GITHUB_APP_PRIVATE_KEY"],
    ["GH_API_BASE_URL", "GITHUB_API_BASE_URL"],
    ["GH_WEB_BASE_URL", "GITHUB_WEB_BASE_URL"],
  ];

  const merged: NodeJS.ProcessEnv = { ...env };

  for (const [canonical, legacy] of aliases) {
    merged[canonical] ??= env[legacy];
  }

  return merged;
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /**
   * Postgres pool size. Defaults to 10, which suits a long-running process.
   * Serverless deployments must lower this to 1-2 and connect through a
   * transaction-mode pooler, because each function instance holds its own pool.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),

  /**
   * 32 bytes, base64-encoded. Generate with:
   *   openssl rand -base64 32
   * Rotating this invalidates every stored GitHub token; users re-authorise.
   */
  ENCRYPTION_KEY: z.string().min(1),

  GH_APP_ID: z.string().min(1),
  /**
   * The app's URL slug, used to build the "install on another org" link.
   * Visible in your app's settings URL: github.com/settings/apps/<slug>
   */
  GH_APP_SLUG: z.string().min(1),
  GH_APP_CLIENT_ID: z.string().min(1),
  GH_APP_CLIENT_SECRET: z.string().min(1),
  /**
   * The app's private key (`.pem`), used to mint installation tokens.
   * Accepts either the raw PEM or a base64 encoding of it — base64 keeps it on
   * one line, which is the only practical way to carry it in a `.env` file.
   */
  GH_APP_PRIVATE_KEY: z.string().min(1),

  /**
   * GitHub Enterprise Server installs point these at their own host. Defaulting
   * to public GitHub keeps the common case zero-config while leaving the seam
   * in place.
   */
  GH_API_BASE_URL: z.string().default("https://api.github.com"),
  GH_WEB_BASE_URL: z.string().default("https://github.com"),

  /** How often the worker re-syncs each user's pull requests. */
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(120),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(preferGh(process.env));

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;

  return cached;
}
