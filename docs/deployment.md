# Deployment

This product is two deployables — the Next.js app and the runner — plus a
PostgreSQL database. They can live on the same host or different ones; the
runner just needs to be reachable from the app over HTTP(S) and must **never**
be exposed to the public internet directly (see below).

## Environment variables

### App (`.env`, see `.env.example`)

| Variable                                                                                                                                                                                             | Required       | Notes                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                                                                                       | yes            | Neon POOLED connection string (uses `-pooler` in hostname). Used by the running app for queries to prevent connection ceiling exhaustion.                                                                              |
| `DIRECT_URL`                                                                                                                                                                                         | for migrations | Neon UNPOOLED direct connection string (no `-pooler` in hostname). Required by Prisma migrations (`prisma migrate deploy`); not read by the running app or `prisma generate`. Locally, set it equal to `DATABASE_URL`. |
| `AUTH_SECRET`                                                                                                                                                                                        | yes            | `openssl rand -base64 32`                                                                                                                                                                                              |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                                                                                                                                              | yes            | Google Cloud Console → APIs & Services → Credentials                                                                                                                                                                   |
| `AUTH_URL`                                                                                                                                                                                           | production     | Public base URL; needed for the OAuth callback                                                                                                                                                                         |
| `AUTH_TRUST_HOST`                                                                                                                                                                                    | behind a proxy | `"true"` on Vercel or behind any reverse proxy                                                                                                                                                                         |
| `RUNNER_URL`                                                                                                                                                                                         | yes            | Where the app reaches the runner                                                                                                                                                                                       |
| `RUNNER_SECRET`                                                                                                                                                                                      | yes            | `openssl rand -hex 32`. **Must match the runner's copy exactly.**                                                                                                                                                      |
| `RUNNER_TIMEOUT_MS`                                                                                                                                                                                  | no             | App-side budget per run request (default 30000)                                                                                                                                                                        |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`                                                                                                                                                | yes (prod)     | Upstash Redis REST API credentials. Required in production (Vercel) to enforce sliding-window rate limits across lambdas. Fails open (no rate limiting) if unset.                                                      |
| `MAX_CODE_BYTES`, `RUN_RATE_LIMIT_PER_MIN`, `SUBMIT_RATE_LIMIT_PER_MIN`, `PROCTOR_RATE_LIMIT_PER_MIN`, `HEARTBEAT_INTERVAL_SECONDS`, `SESSION_STALE_SECONDS`, `TEST_LOG_RETENTION_DAYS`, `LOG_LEVEL` | no             | See `.env.example` for defaults                                                                                                                                                                                        |
| `CRON_SECRET`                                                                                                                                                                                        | production     | Bearer token for `/api/cron/maintenance` (Vercel Cron); unset disables it                                                                                                                                              |
| `SEED_ADMIN_EMAIL`, `SEED_STUDENT_EMAILS`, `SEED_BATCH`                                                                                                                                              | dev only       | Used only by `npm run db:seed` (`SEED_ADMIN_EMAIL` may be a comma-separated list)                                                                                                                                      |
| `ADMIN_EMAILS`                                                                                                                                                                                       | no             | Comma-separated list for `npm run db:seed-admins` (defaults to the list in the script)                                                                                                                                 |

### Runner (`runner/.env`, see `runner/.env.example`)

| Variable                                                            | Required                          | Notes                                                                             |
| ------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `RUNNER_SECRET`                                                     | yes                               | Must match the app's copy                                                         |
| `RUNNER_ISOLATION`                                                  | no                                | `container` (default) or `docker` — see `docs/security.md#isolation-modes`        |
| `RUNNER_MAX_CONCURRENCY`, `RUNNER_MAX_QUEUE`                        | no                                | Bounded-queue tuning; see `docs/architecture.md#rate-limiting-with-upstash-redis` |
| `RUN_TIMEOUT_MS`, `TEST_TIMEOUT_MS`                                 | no                                | Per-run / per-test wall-clock limits                                              |
| `DOCKER_IMAGE`, `DOCKER_MEMORY`, `DOCKER_CPUS`, `DOCKER_PIDS_LIMIT` | only if `RUNNER_ISOLATION=docker` | Per-container resource limits                                                     |

Neither `.env` should ever be committed; both are already in `.gitignore`.

## Google OAuth setup

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth
   client ID** → Web application.
2. Authorised redirect URI: `https://<your-domain>/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` for local dev).
3. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. There is no allowlist step: any Google account with a verified email can
   sign in and becomes a `STUDENT` (see `docs/security.md#identity-and-access`).
   Grant administrators with `npm run db:seed-admins` (see below); after that,
   roles can also be changed on the Students page. After any migration, restart
   long-running app processes so their Prisma client matches the schema (a new
   Vercel deployment always starts fresh).

## Protecting the runner

The runner authenticates the app, not the reverse — anyone who can reach
`RUNNER_URL` and knows `RUNNER_SECRET` can ask it to execute HTML/CSS/JS.
Every request carries an HMAC over `timestamp.body` and stale timestamps are
rejected, so without the secret a request cannot be forged or replayed later.
Prefer, in order:

- a private network / VPC the app can reach but the internet cannot, or
- an allowlist on the runner's ingress limited to the app's outbound IP(s), or
- a public **https** URL with a long random `RUNNER_SECRET` (`openssl rand -hex 32`),
  treated like a database password and rotated if it ever leaks.

On Vercel the third option is the practical one: its functions have no fixed
outbound IPs, so the runner must accept connections from the internet. The
app refuses to start in production with an `http://` runner URL unless the
host is private.

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

## Deploying the app on Vercel

1. **Runner first.** Deploy `runner/Dockerfile` to a host with long-running
   containers (Render, Railway, Fly.io or a VPS) with `RUNNER_SECRET` set and
   an https URL. Check `https://<runner>/health`.
2. **Database migrations — from your machine, before the app deploy.** Take a
   backup, then apply migrations over the **direct** (non-pooler) connection;
   migrations through Neon's pooler can leave a stuck advisory lock (P1002).
   Migrations are additive, so the old deployment keeps working meanwhile.

   ```bash
   pg_dump -Fc -d "$DIRECT_URL" -f backup-$(date +%F).dump
   DIRECT_URL="$DIRECT_URL" DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
   ```

   Prisma migrates over `DIRECT_URL` (`directUrl` in `prisma/schema.prisma`), so
   it must be set wherever you run a migration command.

   Do not run migrations in the Vercel build.

3. **Vercel project.** Import the repository (framework: Next.js; the default
   build command runs `npm run build` = `prisma generate && next build`). Set
   these **Production** environment variables:

   | Variable                                              | Value                                                                           |
   | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
   | `DATABASE_URL`                                        | the **pooled** connection string                                                |
   | `AUTH_SECRET`                                         | `openssl rand -base64 32` (32+ characters)                                      |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`               | from Google Cloud                                                               |
   | `AUTH_URL`                                            | `https://<your-domain>`                                                         |
   | `AUTH_TRUST_HOST`                                     | `true`                                                                          |
   | `RUNNER_URL` / `RUNNER_SECRET`                        | the runner's https URL / the same secret as the runner                          |
   | `RUNNER_TIMEOUT_MS`, `RUNNER_TEST_TIMEOUT_MS`         | optional; keep `RUNNER_TEST_TIMEOUT_MS` equal to the runner's `TEST_TIMEOUT_MS` |
   | `CRON_SECRET`                                         | `openssl rand -hex 32` (enables scheduled maintenance)                          |
   | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | from the Upstash console; without them rate limiting is off                     |

   The server refuses to start with a missing or weak value and names the
   variable in the function logs.

4. **Region.** Project Settings → Functions → set the region closest to the
   database (a Neon project in `us-east-2` → `cle1`, Cleveland).
5. **Function duration.** Routes that wait on the runner declare
   `maxDuration = 300` seconds, which needs Vercel's Fluid compute (the default
   for new projects) or the Pro plan.
6. **Scheduled maintenance.** `vercel.json` runs `/api/cron/maintenance` daily
   (the Hobby-plan limit): it grades sittings abandoned by their students,
   retries grading stalled by a runner outage, and applies
   `TEST_LOG_RETENTION_DAYS`. On Pro, run it every 10 minutes
   (`"schedule": "*/10 * * * *"`). Pages trigger the same sweeps as they load.
7. **Google OAuth.** Add `https://<your-domain>/api/auth/callback/google` as an
   authorised redirect URI and `https://<your-domain>` as a JavaScript origin.
8. **Administrators.** Against the production database:

   ```bash
   DATABASE_URL="<production url>" npm run db:seed-admins -- --dry-run   # review
   DATABASE_URL="<production url>" npm run db:seed-admins -- --yes       # apply
   ```

   The list is in `scripts/seed-admins.ts` (or pass addresses / `ADMIN_EMAILS`).
   It only ever adds ADMIN; it never demotes anyone.

9. **Smoke test.** `/api/health` returns `ok`; sign in with Google as an
   administrator (lands on `/admin`) and as a new account (lands on the student
   dashboard as a STUDENT); run a test with the camera — the camera needs the
   https origin Vercel provides.

Never run `npm run db:seed` against production: it writes demo data and
refuses non-local databases unless `ALLOW_REMOTE_DEMO_SEED=1`.

## First deploy on your own host, step by step

```bash
# 1. Provision Postgres (e.g. Neon), configure DATABASE_URL (pooled) and DIRECT_URL (unpooled).

# 2. Build and run the runner where it will live long-term:
docker build -f runner/Dockerfile -t proctored-runner .
docker run -d --name runner -p 4000:4000 \
  --env-file runner/.env \
  --memory=1g --cpus=2 --pids-limit=512 \
  --security-opt no-new-privileges \
  proctored-runner

# 3. Apply the schema:
npx prisma migrate deploy

# 4. Grant administrators (see scripts/seed-admins.ts); demo data is local-only:
npm run db:seed-admins -- --yes

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

### Render Free Tier & Runner Keep-Alive

When hosting the runner on **Render's free web service tier**, note that Render spins down free services after **~15 minutes** of inbound inactivity. A cold start on wake-up takes 50+ seconds, which causes the Next.js app's health check to timeout and display "Runner offline".

To prevent the instance from entering sleep mode:

- A GitHub Actions workflow ([`.github/workflows/runner-keepalive.yml`](../.github/workflows/runner-keepalive.yml)) runs every 10 minutes (`cron: '*/10 * * * *'`) and sends a `GET` request directly to the runner's public health endpoint (e.g. `https://<render-service>.onrender.com/health`).
- **Configuration**:
  - `vars.RUNNER_HEALTH_URL` (Repository Variable): The runner's public health URL. Configured in GitHub under **Settings → Secrets and variables → Actions → Variables**.
  - `secrets.ALERT_WEBHOOK_URL` (Repository Secret, optional): Webhook URL (Slack, Discord, or generic) called when the runner fails the health check (non-200 response).
- **Operational Tradeoff**: Using a cron keepalive adds an external dependency on GitHub Actions scheduler punctuality. For production environments hosting high-stakes assessments, upgrading the runner container to Render's paid **Starter tier** natively eliminates sleep behavior without requiring keep-alive pings.

## Backups

Nothing in this repository backs up PostgreSQL for you — use your database
provider's backup feature (point-in-time recovery if available). `Attempt`,
graded `TestResult`, and `ProctorEvent` rows are the data that matters most;
they are never deleted by any code path in this app except an explicit exam
deletion (the maintenance job removes only practice runs past retention), which itself refuses to run if the exam has attempts
(`DELETE /api/exams/[id]`, see `src/app/api/exams/[id]/route.ts`) —
archiving is the intended path for an exam with history.

## Scaling beyond one instance

Two things in this build assume a single app process and would need
attention before running the app horizontally scaled:

- **Rate limiting** (`src/lib/rate-limit.ts`) uses Upstash Redis sliding-window
  rate limiting (`@upstash/ratelimit` + `@upstash/redis`). On serverless
  environments like Vercel, requests from the same student land across separate
  ephemeral Lambda instances; an in-process memory limiter cannot reliably enforce
  rate limits (`RUN_RATE_LIMIT_PER_MIN`, `SUBMIT_RATE_LIMIT_PER_MIN`, `PROCTOR_RATE_LIMIT_PER_MIN`).
  Upstash Redis is therefore a **required production dependency**. In local development,
  if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not configured, the limiter
  automatically fails open with a console warning so developers can run offline
  without provisioning Redis.
- **The SSE monitor stream** holds its poll loop in the serving instance's
  memory for up to 4 minutes per connection; this works fine scaled out (each
  admin's browser just talks to whichever instance handled that connection),
  but a sticky-session or connection-draining setting is worth confirming on
  your platform.

The runner already scales independently — `RUNNER_MAX_CONCURRENCY` /
`RUNNER_MAX_QUEUE` are per-instance; run multiple runner instances behind a
load balancer and raise the app's retry/timeout tolerance if you need more
throughput than one runner instance provides.
