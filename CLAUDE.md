# ghspace — working conventions

Architecture and design rationale live in `apps/docs` (`bun run dev:docs`).
This file covers only the conventions that are not visible from the code.

## Commits

[Conventional Commits](https://www.conventionalcommits.org). Subject in the
imperative, lower case after the type, no trailing full stop.

```
feat(triage): give bot dependency updates their own bucket
fix(sync): use partial GraphQL responses instead of discarding the batch
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`,
`chore`. Scopes in use: `sync`, `triage`, `auth`, `worker`, `web`, `docs`,
`db`, `cli`, `dev`. Breaking changes take a `!` before the colon.

The body matters more than the subject. Explain *why* the change is right,
especially when the code looks wrong without it — the reason a rule is ordered
a particular way, or a real-world observation that drove a decision, is exactly
what is expensive to rediscover.

## The one rule that must not be broken

Every read path returning pull requests **must** compose `visibleToUser(userId)`
(`packages/core/src/dashboard.ts`). Pull requests are cached with an
installation token that can read every repository in the account; that
predicate is the only thing keeping one user's dashboard from showing another
team's private work.

## Portability

ghspace uses the Postgres **connection string and nothing else**. No
`@supabase/supabase-js`, no Supabase Auth, and no Row Level Security — RLS
would mean rewriting the access boundary as provider-specific SQL policies and
would end self-hostability. See `/docs/portability`.

## Conventions worth knowing

- Never call the GitHub API during a page render. Postgres is the
  cache-of-record; the worker fills it.
- Transactions are pinned to one connection — no `Promise.all` against `tx`.
  Concurrency against the pool is fine.
- Modules that need one environment variable read it from `process.env`
  directly rather than through `env()`, so unrelated settings do not become
  prerequisites (see `db/client.ts`, `lib/crypto.ts`).
- Bounded loops log when they hit their ceiling. Silent truncation reads as
  "we covered everything".
