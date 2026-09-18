/**
 * Checks a ghspace installation end to end and says exactly what is wrong.
 *
 *   bun run doctor
 *
 * Deliberately reads `process.env` directly rather than going through `env()`:
 * the whole point is to report every missing value at once, and `env()` throws
 * on the first one.
 */
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/core";
import { Pool } from "pg";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const nextSteps: string[] = [];
let failures = 0;

function heading(text: string) {
  console.log(`\n${BOLD}${text}${RESET}`);
}

function ok(label: string, detail = "") {
  console.log(`  ${GREEN}✓${RESET} ${label.padEnd(24)} ${DIM}${detail}${RESET}`);
}

function bad(label: string, detail = "", fix?: string) {
  failures++;
  console.log(`  ${RED}✗${RESET} ${label.padEnd(24)} ${detail}`);
  if (fix) nextSteps.push(fix);
}

function warn(label: string, detail = "", fix?: string) {
  console.log(`  ${YELLOW}!${RESET} ${label.padEnd(24)} ${detail}`);
  if (fix) nextSteps.push(fix);
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable)";
  }
}

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------

heading("Environment");

const env = process.env;

if (env.DATABASE_URL) ok("DATABASE_URL", redact(env.DATABASE_URL));
else bad("DATABASE_URL", "not set", "Set DATABASE_URL in .env (see .env.example).");

for (const [name, label] of [
  ["ENCRYPTION_KEY", "ENCRYPTION_KEY"],
  ["SESSION_SECRET", "SESSION_SECRET"],
] as const) {
  const value = env[name];
  if (!value) {
    bad(label, "not set", `Generate one: openssl rand -base64 32  → ${name} in .env`);
    continue;
  }
  if (name === "ENCRYPTION_KEY") {
    const bytes = Buffer.from(value, "base64").length;
    if (bytes !== 32) {
      bad(label, `decodes to ${bytes} bytes, needs 32`, "Regenerate: openssl rand -base64 32");
      continue;
    }
    ok(label, "32 bytes");
  } else {
    ok(label, `${value.length} chars`);
  }
}

const appId = env.GITHUB_APP_ID;
const privateKeyRaw = env.GITHUB_APP_PRIVATE_KEY;

for (const [name, hint] of [
  ["GITHUB_APP_ID", "the numeric App ID from the app's settings page"],
  ["GITHUB_APP_SLUG", "the last path segment of github.com/settings/apps/<slug>"],
  ["GITHUB_APP_CLIENT_ID", "starts with Iv23li…"],
  ["GITHUB_APP_CLIENT_SECRET", "generated on the app's settings page"],
  ["GITHUB_APP_PRIVATE_KEY", "base64 of the downloaded .pem"],
] as const) {
  const value = env[name];
  if (!value || value === "placeholder") {
    bad(name, value === "placeholder" ? "still a placeholder" : "not set",
      `Set ${name} in .env — ${hint}`);
  } else {
    ok(name, name.includes("SECRET") || name.includes("KEY") ? "set" : value);
  }
}

// The private key is the value most likely to be pasted in wrong.
let privateKey: string | undefined;
if (privateKeyRaw && privateKeyRaw !== "placeholder") {
  privateKey = privateKeyRaw.includes("-----BEGIN")
    ? privateKeyRaw
    : Buffer.from(privateKeyRaw, "base64").toString("utf8");
  if (!privateKey.includes("-----BEGIN")) {
    bad("private key format", "neither a PEM nor base64 of one",
      "Re-encode: base64 -i your-app.private-key.pem | tr -d '\\n'");
    privateKey = undefined;
  } else {
    ok("private key format", "valid PEM");
  }
}

// ---------------------------------------------------------------------------
// 2. Database
// ---------------------------------------------------------------------------

heading("Database");

let userCount = 0;
let installationCount = 0;
let pool: Pool | undefined;

if (!env.DATABASE_URL) {
  bad("connection", "skipped, DATABASE_URL is not set");
} else {
  pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8_000 });
  try {
    const version = await pool.query<{ v: string }>(
      "select current_setting('server_version') as v",
    );
    ok("reachable", `postgres ${version.rows[0]?.v ?? "?"}`);

    const tables = await pool.query<{ n: string }>(
      "select table_name as n from information_schema.tables where table_schema = 'public'",
    );
    const names = new Set(tables.rows.map((r) => r.n));
    const required = [
      "users",
      "installations",
      "repositories",
      "pull_requests",
      "user_repository_access",
      "pull_request_involvement",
    ];
    const missing = required.filter((t) => !names.has(t));
    if (missing.length > 0) {
      bad("migrations", `missing: ${missing.join(", ")}`, "Apply them: bun run db:migrate");
    } else {
      ok("migrations", `${names.size} tables`);

      userCount = Number((await pool.query("select count(*) from users")).rows[0].count);
      installationCount = Number(
        (await pool.query("select count(*) from installations")).rows[0].count,
      );
      const prCount = Number((await pool.query("select count(*) from pull_requests")).rows[0].count);

      console.log(
        `  ${DIM}  users=${userCount}  installations=${installationCount}  pull_requests=${prCount}${RESET}`,
      );
    }
  } catch (error) {
    bad("reachable", error instanceof Error ? error.message : String(error),
      "Start it: bun run db:up");
  }
}

// ---------------------------------------------------------------------------
// 3. GitHub App credentials
// ---------------------------------------------------------------------------

heading("GitHub App");

let appOctokit: Octokit | undefined;

if (!appId || !privateKey) {
  bad("credentials", "skipped, App ID or private key missing");
} else {
  try {
    appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId, privateKey },
      baseUrl: env.GITHUB_API_BASE_URL ?? "https://api.github.com",
      userAgent: "ghspace-doctor",
    });
    const app = await appOctokit.request("GET /app");
    ok("credentials", `"${app.data.name}" (id ${app.data.id})`);

    if (env.GITHUB_APP_SLUG && app.data.slug && env.GITHUB_APP_SLUG !== app.data.slug) {
      warn("GITHUB_APP_SLUG", `.env says "${env.GITHUB_APP_SLUG}", GitHub says "${app.data.slug}"`,
        `Correct it: GITHUB_APP_SLUG=${app.data.slug}`);
    }

    // Permissions actually granted, versus what the sync needs.
    const granted = (app.data.permissions ?? {}) as Record<string, string>;
    const needed = [
      ["pull_requests", "reading pull requests at all"],
      ["metadata", "listing repositories"],
      ["checks", "the CI verdict on each pull request"],
      ["statuses", "legacy commit statuses in the CI verdict"],
    ] as const;
    for (const [key, why] of needed) {
      if (granted[key]) ok(`permission: ${key}`, granted[key]);
      else warn(`permission: ${key}`, `not granted — needed for ${why}`,
        `Add "${key}: Read-only" under the app's Permissions, then accept the prompt on each install.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    bad("credentials", message,
      "Check GITHUB_APP_ID matches the app, and that the private key is the one you downloaded.");
  }
}

// ---------------------------------------------------------------------------
// 4. Installations and a live data probe
// ---------------------------------------------------------------------------

if (appOctokit) {
  heading("Installations");
  try {
    const list = await appOctokit.request("GET /app/installations", { per_page: 100 });
    if (list.data.length === 0) {
      warn("installed on", "no accounts yet",
        env.GITHUB_APP_SLUG && env.GITHUB_APP_SLUG !== "placeholder"
          ? `Install it: https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
          : "Install the app on your account and organisations.");
    } else {
      for (const installation of list.data) {
        const account = installation.account as { login?: string; slug?: string } | null;
        const login = account?.login ?? account?.slug ?? "(unknown)";
        ok(login, `${installation.repository_selection} repositories`);
      }

      // Probe the first installation: mint a token, list repositories, and
      // fetch one pull request to confirm the fields the dashboard depends on
      // actually arrive.
      heading("Data probe");
      const first = list.data[0]!;
      const installationClient = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId, privateKey, installationId: first.id },
        baseUrl: env.GITHUB_API_BASE_URL ?? "https://api.github.com",
        userAgent: "ghspace-doctor",
      });

      const repos = await installationClient.request("GET /installation/repositories", {
        per_page: 100,
      });
      ok("repositories visible", String(repos.data.total_count));

      const probe = repos.data.repositories.find((r) => !r.archived);
      if (!probe) {
        warn("pull request probe", "no non-archived repositories to sample");
      } else {
        const result = (await installationClient.graphql(
          `query($owner: String!, $name: String!) {
             rateLimit { remaining cost }
             repository(owner: $owner, name: $name) {
               pullRequests(states: OPEN, first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) {
                 totalCount
                 nodes {
                   number title reviewDecision mergeable
                   commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
                 }
               }
             }
           }`,
          { owner: probe.owner.login, name: probe.name },
        )) as {
          rateLimit?: { remaining: number; cost: number };
          repository?: {
            pullRequests: {
              totalCount: number;
              nodes: {
                number: number;
                title: string;
                reviewDecision: string | null;
                mergeable: string | null;
                commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
              }[];
            };
          };
        };

        const pr = result.repository?.pullRequests.nodes[0];
        ok("graphql reachable", `${probe.full_name}, ${result.repository?.pullRequests.totalCount ?? 0} open`);
        ok("rate limit", `${result.rateLimit?.remaining ?? "?"} points remaining`);

        if (!pr) {
          warn("field check", `${probe.full_name} has no open pull requests to sample`);
        } else {
          const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
          console.log(`  ${DIM}  sampled #${pr.number}: ${pr.title.slice(0, 48)}${RESET}`);
          ok("reviewDecision", String(pr.reviewDecision));
          ok("mergeable", String(pr.mergeable));
          if (rollup === null) {
            warn("statusCheckRollup", "null — either no CI on this PR, or Checks permission is missing",
              "If this repository does run CI, grant the app Checks and Commit statuses read access.");
          } else {
            ok("statusCheckRollup", rollup);
          }
        }
      }
    }
  } catch (error) {
    bad("installations", error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

heading("Next steps");

if (userCount === 0) {
  nextSteps.push("Sign in at http://localhost:3000 to create your user record.");
} else if (installationCount === 0) {
  nextSteps.push("Sync access and pull requests: cd apps/worker && bun run sync");
}

if (nextSteps.length === 0) {
  console.log(`  ${GREEN}Everything checks out.${RESET}`);
} else {
  for (const step of nextSteps) console.log(`  → ${step}`);
}

console.log(
  failures === 0
    ? `\n${GREEN}No blocking problems.${RESET}\n`
    : `\n${RED}${failures} problem${failures === 1 ? "" : "s"} to fix.${RESET}\n`,
);

await pool?.end();
process.exit(failures === 0 ? 0 : 1);
