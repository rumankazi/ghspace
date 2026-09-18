# ghspace

Your GitHub pull requests, sorted by what actually needs you.

GitHub tells you a pull request exists. It does not tell you which ones are
*yours to move*. ghspace sorts everything you can see into buckets that answer
one question: what should I do next?

- **Blocked on you** — your review is requested and nobody can move without it
- **Needs your action** — changes requested, failing checks, or a merge conflict
- **Ready to merge** — approved, green, mergeable
- **Blocked on others** — your open PRs waiting on a review
- **Your drafts** / **Watching**

Plus a browse view over every open pull request you can see, filterable by
repository, author, involvement, draft status and title.

📖 **Full architecture documentation: `bun run dev:docs` → http://localhost:3001**

## Status

MVP 1 of a wider GitHub workspace. Pull requests only; Actions and repository
views come later.

## How it works

Three decisions shape everything else.

**Postgres is the cache-of-record.** Page renders read only from the database,
never from GitHub. An outage or a rate limit degrades the dashboard to slightly
stale data with a visible "synced 4m ago" marker, instead of an error page.

**The GitHub App is the query point.** Pull requests are fetched *per
installation*, not per user — one sync of an organisation serves every ghspace
user in it, runs with nobody signed in, and spends a rate limit budget dedicated
to that installation. Users then filter the cached data, which is a database
query rather than another API call.

**Involvement is derived, not asked for.** Because the sync fetches repositories
whole, "which PRs involve me" is computed locally from who opened it, who is
assigned, whose review is pending, and who has reviewed.

## Architecture

```
apps/web       Next.js — sign-in, triage view, browse view (reads Postgres only)
apps/worker    Bun — background sync loop, token refresh
apps/docs      Next.js + fumadocs — architecture documentation
packages/core  schema, GitHub clients, sync logic, triage rules, read queries
```

The worker is a separate process rather than a cron route so that self-hosting
is `docker compose up` with web + worker + postgres, and so nothing about the
deployment target leaks into the sync logic.

## Access model

A **GitHub App only sees accounts where it is installed** — user access tokens
included:

> "The app can only access resources in an account where it is installed. If
> your app is only installed on a user's personal account, it cannot access
> resources in an organization that the user is a member of unless the app is
> also installed on that organization."

So installing ghspace on the organisations you work in is what makes their pull
requests exist as far as ghspace is concerned. The dashboard shows its own
coverage for exactly this reason.

The app uses two tokens for two jobs:

| | Installation token | User token |
|---|---|---|
| Acts as | the app itself | the signed-in user |
| Sees | everything the installation granted | installation ∩ that user's own access |
| Rate limit | 5,000/hr dedicated, scaling to 12,500 | 5,000/hr shared across all apps for that user |
| Used for | fetching pull requests | identity, and the access allowlist |

> [!IMPORTANT]
> An installation token can read **every** repository in the installation. The
> `user_repository_access` table is the only thing that knows which of them a
> given user is entitled to, and **every read path returning pull requests must
> filter through it**. See the Access model page in the docs.

## Setup

**1. Create a GitHub App** at https://github.com/settings/apps/new:

- Callback URL: `http://localhost:3000/api/auth/callback`
- ✅ **Request user authorization (OAuth) during installation**
- ✅ **Expire user authorization tokens**
- ❌ Webhooks (not used yet)
- Repository permissions: **Pull requests: Read-only**, **Metadata: Read-only**
- Generate a private key and download the `.pem`

Then **install it** — on your own account, and on every organisation whose pull
requests you want to see.

**2. Configure:**

```bash
cp .env.example .env
openssl rand -base64 32                             # -> ENCRYPTION_KEY
openssl rand -base64 32                             # -> SESSION_SECRET
base64 -i your-app.private-key.pem | tr -d '\n'     # -> GH_APP_PRIVATE_KEY
# then fill in GH_APP_SLUG / GH_APP_ID / GH_APP_CLIENT_ID / GH_APP_CLIENT_SECRET
```

**3. Run:**

```bash
bun install
bun run db:up          # Postgres via docker or podman
bun run db:migrate
bun run dev:web        # http://localhost:3000
bun run dev:worker     # second terminal
bun run dev:docs       # http://localhost:3001 — architecture docs
```

Sign in, then either wait for the worker's first cycle or hit **Refresh**.

To sync once without the worker running:

```bash
cd apps/worker
bun run sync            # every user's access, then every installation
bun run sync <login>    # one user's access, then every installation
```

## Deployment

Three moving parts — web app, worker, Postgres — and every deployment is a
different answer to where each runs.

**Self-hosted**, the whole stack on your own hardware:

```bash
cp .env.example .env    # fill in the GitHub App values, generate the secrets
docker compose up       # postgres + migrations + web on :3000 + worker
```

**Zero cost**: Vercel Hobby for the web app, Supabase free for Postgres, and
`.github/workflows/sync.yml` — a scheduled GitHub Action — in place of the
worker. Set `DATABASE_POOL_MAX=1` and use the transaction-mode pooler on
serverless, where every function instance opens its own pool.

> [!IMPORTANT]
> These stay interchangeable only because ghspace uses **the Postgres
> connection string and nothing else**. No `@supabase/supabase-js`, no Supabase
> Auth, and above all no Row Level Security — RLS would mean rewriting the
> access boundary as provider-specific SQL policies and would end
> self-hostability. See the Portability page in the docs.

Switching between them is one line of `.env`.

## Commands

| Command | Does |
|---|---|
| `bun run dev:web` / `dev:worker` / `dev:docs` | run one process |
| `bun run db:up` / `db:down` / `db:reset` | local Postgres lifecycle |
| `bun run db:generate` | generate a migration after a schema change |
| `bun run db:migrate` | apply migrations |
| `bun run typecheck` | typecheck every workspace |
| `cd packages/core && bun test` | run tests |
| `docker compose up` | the whole stack, as a self-host install would run it |

## Known limits

Two signals are lost compared to a per-user `involves:@me` search, because
GitHub only exposes them through search qualifiers:

- **Mentions and comments** — the Watching bucket is weaker as a result
- **Team review requests** — silently under-fills *Blocked on you*, which
  matters more

`searchPullRequests()` is kept as the recovery path for both. See the Sync
pipeline page in the docs.

## Not yet built

Webhooks for near-realtime updates, GitHub Actions and repository views,
multi-user onboarding, and Enterprise packaging.
