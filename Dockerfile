# Self-host image for ghspace.
#
# One Dockerfile, two targets — `web` and `worker`. They share a dependency
# layer, so building both costs barely more than building one, and the two
# processes can never drift onto different versions of packages/core.
#
#   docker build --target web    -t ghspace-web .
#   docker build --target worker -t ghspace-worker .
#
# Or just `docker compose up`, which builds both.

FROM oven/bun:1.4-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
# Bun installs packages and runs the worker, but Next.js is a Node framework:
# its build spawns a real `node` for type checking, and the shim Bun provides is
# not a drop-in replacement. Installing Node keeps Next on the runtime it
# expects instead of debugging shim differences later.
RUN apk add --no-cache nodejs

# --- dependencies ----------------------------------------------------------
# Only the manifests are copied here, so this layer is cached until a
# package.json actually changes rather than on every source edit.
FROM base AS deps
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/docs/package.json apps/docs/
RUN bun install --frozen-lockfile

# --- source ----------------------------------------------------------------
FROM deps AS source
COPY packages/ packages/
COPY apps/ apps/

# --- web -------------------------------------------------------------------
FROM source AS web-build
# Every page is `force-dynamic`, so the build needs no database and no secrets.
# Invoked through the bin shim so the `#!/usr/bin/env node` shebang selects
# Node rather than Bun.
RUN cd apps/web && ./node_modules/.bin/next build

FROM web-build AS web
EXPOSE 3000
# `next start` rather than the standalone output: the image is larger, but it
# keeps the monorepo's source-level imports of packages/core working without a
# separate bundling step.
CMD ["sh", "-c", "cd apps/web && ./node_modules/.bin/next start -p 3000 -H 0.0.0.0"]

# --- worker ----------------------------------------------------------------
# No build step: Bun runs the worker straight from TypeScript.
FROM source AS worker
CMD ["sh", "-c", "cd apps/worker && bun run src/index.ts"]

# --- migrations ------------------------------------------------------------
# Run once against a new database, then exit. Compose uses this to bring the
# schema up before the web and worker containers start.
FROM source AS migrate
CMD ["sh", "-c", "cd packages/core && bun run src/db/migrate.ts"]
