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
`db`, `cli`, `core`, `config`, `dev`. Breaking changes take a `!` before the
colon.

The body matters more than the subject. Explain *why* the change is right,
especially when the code looks wrong without it — the reason a rule is ordered
a particular way, or a real-world observation that drove a decision, is exactly
what is expensive to rediscover.

## Pull request titles

**A pull request title is a commit subject and follows the same rules**, because
this repository squash-merges. GitHub's squash title is set to
`COMMIT_OR_PR_TITLE`: a single-commit pull request inherits that commit's
subject, and everything else takes the **pull request title** verbatim. So a
prose title on a multi-commit branch does not stay in the pull request — it
lands on `main` as the commit message.

```
feat(auth): make installing the app part of onboarding      ← lands well
Make installing the app part of the sign-in flow            ← breaks `main`
```

That second one is not hypothetical; it is
[2d67509](https://github.com/rumankazi/ghspace/commit/2d67509), the one
non-conforming subject in the history, and it got there exactly this way.

The description carries what a commit body would: why the change is right, and
what a reviewer would otherwise have to reconstruct. Say plainly what is *not*
covered — a path that could not be exercised locally is worth more to a
reviewer than a list of what passed.

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
