#!/usr/bin/env bash
# Starts the local development database.
#
# `docker compose up` is the supported path (and is what a self-host install
# uses), but this script also works with a bare podman/docker CLI when no
# compose provider is installed, so `bun run db:up` works either way.
set -euo pipefail

CONTAINER=ghspace-postgres
VOLUME=ghspace-pgdata
IMAGE=docker.io/library/postgres:18-alpine
PORT=5433

RUNTIME=""
for candidate in docker podman; do
  if command -v "$candidate" >/dev/null 2>&1; then RUNTIME="$candidate"; break; fi
done
if [ -z "$RUNTIME" ]; then
  echo "No docker or podman found. Install one, or point DATABASE_URL at your own Postgres." >&2
  exit 1
fi

case "${1:-up}" in
  up)
    if "$RUNTIME" container exists "$CONTAINER" 2>/dev/null || \
       "$RUNTIME" inspect "$CONTAINER" >/dev/null 2>&1; then
      "$RUNTIME" start "$CONTAINER" >/dev/null
    else
      "$RUNTIME" volume create "$VOLUME" >/dev/null 2>&1 || true
      "$RUNTIME" run -d --name "$CONTAINER" \
        -e POSTGRES_USER=ghspace \
        -e POSTGRES_PASSWORD=ghspace \
        -e POSTGRES_DB=ghspace \
        -p "${PORT}:5432" \
        -v "${VOLUME}:/var/lib/postgresql" \
        "$IMAGE" >/dev/null
    fi
    printf 'waiting for postgres on :%s' "$PORT"
    for _ in $(seq 1 60); do
      if "$RUNTIME" exec "$CONTAINER" pg_isready -U ghspace -d ghspace >/dev/null 2>&1; then
        echo " ready"
        exit 0
      fi
      printf '.'
      sleep 1
    done
    echo " timed out" >&2
    exit 1
    ;;
  down) "$RUNTIME" stop "$CONTAINER" >/dev/null && echo "stopped $CONTAINER" ;;
  reset)
    "$RUNTIME" rm -f "$CONTAINER" >/dev/null 2>&1 || true
    "$RUNTIME" volume rm "$VOLUME" >/dev/null 2>&1 || true
    echo "removed $CONTAINER and $VOLUME"
    ;;
  *) echo "usage: dev-db.sh [up|down|reset]" >&2; exit 1 ;;
esac
