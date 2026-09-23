# Deployment

This product is two deployables — the Next.js app and the runner — plus a
PostgreSQL database. They can live on the same host or different ones; the
runner just needs to be reachable from the app over HTTP(S) and must **never**
be exposed to the public internet directly (see below).

## Environment variables

### App (`.env`, see `.env.example`)

| Variable                                                                                                                                                                                             | Required       | Notes                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                                                                                       | yes            | PostgreSQL connection string                                      |
| `AUTH_SECRET`                                                                                                                                                                                        | yes            | `openssl rand -base64 32`                                         |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                                                                                                                                              | yes            | Google Cloud Console → APIs & Services → Credentials              |
| `AUTH_URL`                                                                                                                                                                                           | production     | Public base URL; needed for the OAuth callback                    |
| `AUTH_TRUST_HOST`                                                                                                                                                                                    | behind a proxy | `"true"` on Vercel or behind any reverse proxy                    |
| `RUNNER_URL`                                                                                                                                                                                         | yes            | Where the app reaches the runner                                  |
| `RUNNER_SECRET`                                                                                                                                                                                      | yes            | `openssl rand -hex 32`. **Must match the runner's copy exactly.** |
| `RUNNER_TIMEOUT_MS`                                                                                                                                                                                  | no             | App-side budget per run request (default 30000)                   |
| `MAX_CODE_BYTES`, `RUN_RATE_LIMIT_PER_MIN`, `SUBMIT_RATE_LIMIT_PER_MIN`, `PROCTOR_RATE_LIMIT_PER_MIN`, `HEARTBEAT_INTERVAL_SECONDS`, `SESSION_STALE_SECONDS`, `TEST_LOG_RETENTION_DAYS`, `LOG_LEVEL` | no             | See `.env.example` for defaults                                   |
| `SEED_ADMIN_EMAIL`, `SEED_STUDENT_EMAILS`, `SEED_BATCH`                                                                                                                                              | dev only       | Used only by `npm run db:seed`                                    |

### Runner (`runner/.env`, see `runner/.env.example`)

| Variable                                                            | Required                          | Notes                                                                        |
| ------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `RUNNER_SECRET`                                                     | yes                               | Must match the app's copy                                                    |
| `RUNNER_ISOLATION`                                                  | no                                | `container` (default) or `docker` — see `docs/security.md#isolation-modes`   |
| `RUNNER_MAX_CONCURRENCY`, `RUNNER_MAX_QUEUE`                        | no                                | Bounded-queue tuning; see `docs/architecture.md#rate-limiting-without-redis` |
| `RUN_TIMEOUT_MS`, `TEST_TIMEOUT_MS`                                 | no                                | Per-run / per-test wall-clock limits                                         |
| `DOCKER_IMAGE`, `DOCKER_MEMORY`, `DOCKER_CPUS`, `DOCKER_PIDS_LIMIT` | only if `RUNNER_ISOLATION=docker` | Per-container resource limits                                                |

Neither `.env` should ever be committed; both are already in `.gitignore`.

## Google OAuth setup

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth
   client ID** → Web application.
2. Authorised redirect URI: `https://<your-domain>/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` for local dev).
3. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. Add every mentor/student's exact address to `AllowedEmail` **before** they
   try to sign in — see `docs/security.md#identity-and-access`. Signing in
   with an address that isn't allowlisted yet fails with a specific,
   non-technical message; it does not create an account.

## The runner must not be public

The runner authenticates the app, not the reverse — anyone who can reach
`RUNNER_URL` and knows `RUNNER_SECRET` can ask it to execute HTML/CSS/JS.
Put it behind:

- a private network / VPC the app can reach but the internet cannot, or
- an allowlist on the runner's ingress limited to the app's outbound IP(s), or
- at minimum, treat `RUNNER_SECRET` with the same care as a database
  password and rotate it if it ever leaks.

Do **not** deploy the runner to a platform that only offers a public URL with
no network-level restriction unless you've added your own auth layer in
front of it.

## Suggested topology

```
┌─────────────┐      ┌──────────────────┐      ┌────────────┐
│   Vercel /   │─────▶│  Runner (Fly.io,  │      │ PostgreSQL │
│  your host   │      │  Railway, a VPS —  │      │ (managed,  │
│  (Next.js)   │◀─────│  private network)  │      │  e.g. Neon,│
└──────┬───────┘      └──────────────────┘      │  Supabase, │
       │                                          │  RDS)      │
       └─────────────────────────────────────────▶└────────────┘
```

The runner needs to run a real headless Chromium, so it should **not** go on
a platform without persistent/long-running compute (most serverless function
platforms, including Vercel's default runtime, are a poor fit for it — the
app can live there, the runner should not).

## First deploy, step by step

```bash
# 1. Provision Postgres, get its connection string into DATABASE_URL.

# 2. Build and run the runner where it will live long-term:
docker build -f runner/Dockerfile -t proctored-runner .
docker run -d --name runner -p 4000:4000 \
  --env-file runner/.env \
  --memory=1g --cpus=2 --pids-limit=512 \
  --security-opt no-new-privileges \
  proctored-runner

# 3. Apply the schema:
npx prisma migrate deploy

# 4. (Optional, first deploy only) seed an admin + worked examples:
npm run db:seed

# 5. Build and start the app:
npm run build
npm run start   # or deploy the Next.js app to your platform of choice

# 6. Validate end-to-end from a machine that can reach everything:
bash scripts/validate-stack.sh
```

## Health and monitoring

- `GET /api/health` — checks the database and the runner, returns 200 only
  if both are reachable. Point an uptime monitor at this; it deliberately
  returns no configuration detail.
- The runner exposes its own `GET /health` (used by `docker-compose.yml`'s
  healthcheck and by `/api/health`).
- `/admin` (overview page) shows runner status to signed-in admins with a
  clear warning if it's unreachable — a mentor should see this before a
  student reports "Run Test Cases doesn't work."
- `/admin/test-logs` and `/admin/settings` (audit log) are the operational
  diagnosis surfaces once something has gone wrong.

## Backups

Nothing in this repository backs up PostgreSQL for you — use your database
provider's backup feature (point-in-time recovery if available). `Attempt`,
`TestResult`, and `ProctorEvent` rows are the data that matters most; they
are never deleted by any code path in this app except an explicit exam
deletion, which itself refuses to run if the exam has attempts
(`DELETE /api/exams/[id]`, see `src/app/api/exams/[id]/route.ts`) —
archiving is the intended path for an exam with history.

## Scaling beyond one instance

Two things in this build assume a single app process and would need
attention before running the app horizontally scaled:

- **Rate limiting** (`src/lib/rate-limit.ts`) is in-memory per instance —
  each instance would enforce its own limit independently. Swap in a
  Redis/Upstash-backed implementation behind the same `rateLimit(key, limit,
windowMs)` interface.
- **The SSE monitor stream** holds its poll loop in the serving instance's
  memory for up to 4 minutes per connection; this works fine scaled out (each
  admin's browser just talks to whichever instance handled that connection),
  but a sticky-session or connection-draining setting is worth confirming on
  your platform.

The runner already scales independently — `RUNNER_MAX_CONCURRENCY` /
`RUNNER_MAX_QUEUE` are per-instance; run multiple runner instances behind a
load balancer and raise the app's retry/timeout tolerance if you need more
throughput than one runner instance provides.
