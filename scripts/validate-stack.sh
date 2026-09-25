#!/usr/bin/env bash
#
# Full-stack validation, meant to run on a machine WITH internet access,
# Docker, and enough disk/RAM to build the app and download Playwright's
# Chromium. This is the script that turns the honest "BLOCKED" lines in
# BUILD_REPORT.md into real PASS/FAIL results.
#
# It runs seven loops, in order, and stops at the first failure (set -e) so a
# broken step never gets papered over by a step that happens to succeed later.
# Each loop prints a single, greppable "LOOP N: <NAME> -- PASS|FAIL" line.
#
# Usage:
#   cp .env.example .env              # fill in AUTH_GOOGLE_ID/SECRET etc.
#   bash scripts/validate-stack.sh
#
# Safe to re-run. Loop 5 (seed) is destructive to whatever database
# DATABASE_URL points at -- point it at a throwaway database, never production.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

RESULTS_FILE="$(mktemp)"
trap 'rm -f "$RESULTS_FILE"' EXIT

log()  { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
pass() { printf 'LOOP %s: %-22s -- PASS\n' "$1" "$2" | tee -a "$RESULTS_FILE"; }
fail() { printf 'LOOP %s: %-22s -- FAIL\n' "$1" "$2" | tee -a "$RESULTS_FILE"; exit 1; }

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and fill in AUTH_GOOGLE_ID," >&2
  echo "AUTH_GOOGLE_SECRET, AUTH_SECRET and RUNNER_SECRET before running this." >&2
  exit 1
fi
set -a; source .env; set +a

# --------------------------------------------------------------- Loop 1: build
log "Loop 1 / 7 -- npm install + typecheck + lint"
npm install
npm run typecheck
npm run lint
pass 1 "install/typecheck/lint"

# --------------------------------------------------------------- Loop 2: unit tests
log "Loop 2 / 7 -- unit tests (vitest)"
npm test
pass 2 "unit tests"

# --------------------------------------------------------------- Loop 3: production build
log "Loop 3 / 7 -- prisma generate + next build"
npx prisma generate
npm run build
pass 3 "production build"

# --------------------------------------------------------------- Loop 4: database + migrate
log "Loop 4 / 7 -- database up + migrate"
docker compose up -d db
echo "Waiting for postgres to report healthy..."
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' coding-platform-db 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || fail 4 "database"
# Loops 4-5 migrate and seed $DATABASE_URL; never let that be a shared database.
node scripts/assert-local-db.mjs || fail 4 "database is not local"
npm run db:deploy
pass 4 "database + migrate"

# --------------------------------------------------------------- Loop 5: seed
log "Loop 5 / 7 -- seed (DESTRUCTIVE to \$DATABASE_URL)"
npm run db:seed
pass 5 "seed"

# --------------------------------------------------------------- Loop 6: runner
log "Loop 6 / 7 -- runner container + health + a real graded run"
docker compose up -d --build runner
echo "Waiting for the runner to report healthy..."
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' coding-platform-runner 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || fail 6 "runner"
npm --prefix runner test

# Exercise the real HTTP path with a signed request, exactly as the app does,
# so this loop proves the isolation boundary (Docker) AND the HMAC handshake
# AND an actual Playwright-driven DOM assertion all work together.
node --experimental-strip-types --no-warnings scripts/smoke-runner.mjs
pass 6 "runner (container + signed request + real DOM assertion)"

# --------------------------------------------------------------- Loop 7: e2e
log "Loop 7 / 7 -- Playwright browsers + app + e2e (unauthenticated tier)"
npx playwright install --with-deps chromium
npm run dev &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null || true; rm -f "$RESULTS_FILE"' EXIT

echo "Waiting for the app to respond..."
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/api/health >/dev/null && break
  sleep 2
done
curl -sf http://localhost:3000/api/health >/dev/null || fail 7 "e2e (app did not start)"

npx playwright test tests/e2e/public.spec.ts
echo "Skipping tests/e2e/exam-flow.spec.ts: it needs a saved Google session"
echo "(see tests/e2e/README.md) which this unattended script cannot produce."
pass 7 "e2e (public tier)"

kill $DEV_PID 2>/dev/null || true

# --------------------------------------------------------------------- summary
log "Summary"
cat "$RESULTS_FILE"
echo
echo "All loops that ran, passed. tests/e2e/exam-flow.spec.ts and"
echo "tests/e2e/admin surface still need E2E_STORAGE_STATE / E2E_ADMIN_STORAGE_STATE"
echo "from a real signed-in session -- see tests/e2e/README.md."
