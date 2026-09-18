# Vendored anti-slop Oxlint plugin

Installed on 2026-09-18 by the `install-anti-slop` skill's `scripts/install.mjs`.
The skill is itself vendored into this repository at
`.claude/skills/install-anti-slop`, pinned by `/skills-lock.json`.

## Source identity

Upstream: [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop), path
`skills/install-anti-slop/assets/anti-slop`, at commit

```
c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b   (2026-09-10, repo HEAD at install)
```

That commit is **verified, not assumed**: the upstream tarball was downloaded at
that revision and its 38 asset files hash identically to this directory. The
assets themselves last changed in `e6676e8d0bf1` ("feat(effect): prefer Match
for literal branches", 2026-09-10); `c44ef22` is simply the newest revision
known to carry this exact content.

`skills-lock.json` records the source repository and a `computedHash`, but no
commit — hence the pin above.

## Local deviations from that revision

This tree is no longer byte-identical to upstream, deliberately. Rather than a
single digest — which would only tell you *that* it diverged — the delta is
enumerable directly against the pristine base:

```sh
diff -rq .claude/skills/install-anti-slop/assets/anti-slop tools/oxlint/anti-slop
```

That must print exactly these four lines, and nothing else:

| Difference | Why |
| --- | --- |
| `Only in LOCAL: UPSTREAM.md` | this record |
| `Only in LOCAL/rules: require-visible-to-user.ts` | ghspace-local rule; see its file header |
| `Only in LOCAL/rules: require-visible-to-user.test.ts` | its CLI test |
| `index.ts differs` | two added lines importing and registering that rule |

Anything else in that output is unreviewed drift. The base itself must still
hash to `69fa217ad6262822167aeaa4b4cf9d10bddbba0bd9fcb7f83e1807f3707bdca3`:

```sh
cd .claude/skills/install-anti-slop/assets/anti-slop \
  && find . -type f | sort | xargs shasum -a 256 | shasum -a 256
```

**On update, keep the local rule, its test, and the two `index.ts` lines.**
`references/update.md` is explicit that local-only rules are owned policy, not
drift to erase — and this one is the access boundary, so losing it in a merge
would silently remove the check that keeps one user's dashboard from showing
another team's private work.

## The base for the next update

`.claude/skills/install-anti-slop/assets/anti-slop` is the **recoverable
pristine base** in the sense `references/update.md` means it: the upstream bytes
this directory was derived from, not merely a hash of them. Keep it committed.

That is what makes the next update a three-way merge — `base → local` (our
edits) against `base → incoming` (upstream's) — instead of the conservative
two-way port the procedure falls back to when no base exists. The digest above
can prove this copy drifted; only those bytes can say *how*.

So the two trees are not redundant:

| Tree | Role | Changes when |
| --- | --- | --- |
| `tools/oxlint/anti-slop/` | live plugin, owned by ghspace, may be edited locally | we change policy |
| `.claude/skills/.../assets/anti-slop/` | pristine base, never edited | the skill is updated |

Never point `jsPlugins` at the skill copy. Lint policy would then follow agent
tooling, and a skill update would change enforced rules with no diff to review.

## Installed paths

- `index.ts` — generic plugin entry point, registered in `/.oxlintrc.json` as
  `jsPlugins[].specifier`.
- `rules/`, `shared/` — the 18 generic rules and their AST/scope helpers.
- `vendor/eslint-stylistic/` — the `padding-line-between-statements` rule that
  backs `require-readable-spacing`, with its own `UPSTREAM.md` and the MIT
  `LICENSE`. Both travel with every redistributed copy; do not drop them.
- `effect/` — copied but **not registered**. ghspace has no direct `effect`
  dependency, so the Effect plugin stays off. Register it in `.oxlintrc.json`
  only if that changes.

## Intentional deviations

- **No upstream rule tests were copied**; the skill assets ship none. Upstream
  keeps 24 `*.test.ts` files under `src/rules/`, outside the asset tree — that
  is what `vendor/eslint-stylistic/UPSTREAM.md` means when it cites test
  coverage. So the 18 upstream rules are unverified *here*: check upstream
  before trusting an edge case. The one exception is the local
  `require-visible-to-user`, which has its own CLI test and runs in CI.
- Severities are split between errors and a ratchet of warnings; the reasoning
  and the per-rule counts live in `/.oxlintrc.json`. `require-visible-to-user`
  is an error and must stay one.
- `tools/oxlint/anti-slop/**` is in `ignorePatterns`: the plugin is vendored
  code and is not linted as ghspace source. It is likewise outside every
  `tsconfig.json`, so `bun run typecheck` does not cover it.
- Pinned to `oxlint`/`@oxlint/plugins` `1.83.0` exactly, both as dev
  dependencies. The plugin API is version-coupled — move both together.

## Updating

Follow `.claude/skills/install-anti-slop/references/update.md`. It preserves
local rule and configuration choices; do not overwrite this directory wholesale.
Update the commit pin and the local-deviation table above in the same change,
and bump `oxlint`/`@oxlint/plugins` together. After merging, re-run
`bun test tools/oxlint` — it is the only evidence that the access rule still
does what it claims.
