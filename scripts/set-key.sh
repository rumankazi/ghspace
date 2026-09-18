#!/usr/bin/env bash
# Writes a GitHub App private key into .env, base64-encoded onto one line.
#
#   ./scripts/set-key.sh ~/Downloads/your-app.2026-09-18.private-key.pem
#
# A .env file cannot hold a multi-line value, and hand-encoding the PEM is the
# step most likely to go wrong, so it is a script rather than an instruction.
set -euo pipefail

PEM="${1:-}"
ENV_FILE="${2:-.env}"

if [ -z "$PEM" ]; then
  echo "usage: ./scripts/set-key.sh <path-to.pem> [env-file]" >&2
  exit 1
fi
if [ ! -f "$PEM" ]; then
  echo "No such file: $PEM" >&2
  exit 1
fi
if ! grep -q -- "-----BEGIN" "$PEM"; then
  echo "$PEM does not look like a PEM private key." >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE does not exist. Run: cp .env.example .env" >&2
  exit 1
fi

ENCODED=$(base64 < "$PEM" | tr -d '\n')

# Rewritten with awk rather than sed -i: the value contains characters sed
# would treat as delimiters, and this keeps the rest of the file byte-identical.
TMP=$(mktemp)
awk -v val="$ENCODED" '
  /^GITHUB_APP_PRIVATE_KEY=/ { print "GITHUB_APP_PRIVATE_KEY=" val; found=1; next }
  { print }
  END { if (!found) print "GITHUB_APP_PRIVATE_KEY=" val }
' "$ENV_FILE" > "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "GITHUB_APP_PRIVATE_KEY written to $ENV_FILE (${#ENCODED} chars)."
echo "You can delete $PEM now — the key is only needed in .env."
