#!/usr/bin/env bash
#
# Packages the repository into proctored-coding-platform-final.zip in the
# current directory's parent (or $OUT_DIR if set), excluding everything that
# should never ship: dependencies, build output, local env files, git
# metadata, and any saved e2e session state.
#
# Usage: bash scripts/make-zip.sh [output-path]

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="${1:-${OUT_DIR:-..}/proctored-coding-platform-final.zip}"

EXCLUDES=(
  "node_modules/*" "*/node_modules/*"
  ".next/*" "*/.next/*"
  "dist/*" "*/dist/*"
  "build/*" "out/*"
  "coverage/*" "test-results/*" "playwright-report/*" "blob-report/*"
  ".git/*" ".git"
  ".env" ".env.local" ".env.*.local"
  "*.log" "npm-debug.log*"
  ".DS_Store" ".idea/*" ".vscode/*"
  "pgdata/*"
  "*.tsbuildinfo" "next-env.d.ts"
  "e2e-state.json" "e2e-admin-state.json"
  "*.zip"
)

rm -f "$OUT"

if command -v zip >/dev/null 2>&1; then
  EXCLUDE_ARGS=()
  for pattern in "${EXCLUDES[@]}"; do
    EXCLUDE_ARGS+=(-x "$pattern")
  done
  zip -rq "$OUT" . "${EXCLUDE_ARGS[@]}"
else
  # Fall back to a tiny Node script when the `zip` binary is unavailable
  # (this container has no `zip` installed, for example).
  node --experimental-strip-types --no-warnings "$(dirname "${BASH_SOURCE[0]}")/make-zip.mjs" "$OUT"
fi

echo "Wrote $OUT"
du -h "$OUT" 2>/dev/null || true
