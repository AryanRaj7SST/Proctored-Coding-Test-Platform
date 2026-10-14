# Proctored-Coding-Test-Platform

A proctored online coding assessment platform featuring real-time code evaluation, test suite runners, proctoring event monitoring, and candidate leaderboards.

---

## Runner pool

To support high-concurrency coding assessments and ensure zero student downtime during runner crashes or heavy load, the platform supports a multi-runner pool with automatic request rotation and failover.

The pool is defined in [`docker-compose.pool.yml`](./docker-compose.pool.yml) with distinct services `runner1`, `runner2`, and `runner3`. Each runner operates on an isolated private Docker network without publishing ports to the host.

### Validation

Validate the multi-runner Compose configuration:

```bash
docker compose -f docker-compose.pool.yml config
```

> **Note:** All runners require `RUNNER_SECRET` with no default fallback (`${RUNNER_SECRET:?set RUNNER_SECRET}`). If unset, Compose refuses to start or validate.

### Starting the pool

Start the multi-runner pool and application in the background:

```bash
RUNNER_SECRET="your-32-byte-hex-secret-here" docker compose -f docker-compose.pool.yml up -d
```

### Inspecting runner health

Because runner ports are not exposed on the host for network isolation, query runner health endpoints from within the Docker network or directly inside the runner containers:

1. **Directly inside a runner container via Node fetch:**

   ```bash
   docker compose -f docker-compose.pool.yml exec runner1 node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.json()).then(console.log)"
   docker compose -f docker-compose.pool.yml exec runner2 node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.json()).then(console.log)"
   docker compose -f docker-compose.pool.yml exec runner3 node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.json()).then(console.log)"
   ```

2. **From the application container:**
   ```bash
   docker compose -f docker-compose.pool.yml exec app node -e "fetch('http://runner1:4000/health').then(r=>r.json()).then(console.log)"
   docker compose -f docker-compose.pool.yml exec app node -e "fetch('http://runner2:4000/health').then(r=>r.json()).then(console.log)"
   docker compose -f docker-compose.pool.yml exec app node -e "fetch('http://runner3:4000/health').then(r=>r.json()).then(console.log)"
   ```

### Restarting a single runner without affecting others

If a single runner requires maintenance or encounters a hung process, restart only that runner instance without touching the rest of the pool:

```bash
docker compose -f docker-compose.pool.yml restart runner2
```

While `runner2` restarts, the application automatically detects unreachable attempts, fails over to `runner1` and `runner3`, and flags the pool as `degraded` in the admin dashboard until `runner2` passes health checks again.

### Scaling the pool up or down

#### Scaling up (adding runner4..N):

1. In `docker-compose.pool.yml`, define the new service:
   ```yaml
   runner4:
     <<: *runner-base
     container_name: coding-platform-runner-4
   ```
2. Update the `app` service's `RUNNER_URLS` environment variable:
   ```yaml
   RUNNER_URLS: 'http://runner1:4000,http://runner2:4000,http://runner3:4000,http://runner4:4000'
   ```
3. Start the new runner and reload the application configuration:
   ```bash
   docker compose -f docker-compose.pool.yml up -d runner4
   docker compose -f docker-compose.pool.yml up -d app
   ```

#### Scaling down:

1. Remove the service URL from `RUNNER_URLS` in `docker-compose.pool.yml` (or `.env`).
2. Reload the app container:
   ```bash
   docker compose -f docker-compose.pool.yml up -d app
   ```
3. Stop and remove the decommissioned runner:
   ```bash
   docker compose -f docker-compose.pool.yml stop runner3
   docker compose -f docker-compose.pool.yml rm -f runner3
   ```

---

### Render multi-service deployment

When deploying the runner pool to Render:

1. **Deploy multiple Web Services:**
   - In Render, create separate Web Services using `runner/Dockerfile` (e.g. `coding-runner-1`, `coding-runner-2`, `coding-runner-3`).
   - Set the runtime environment to **Docker**.
   - Configure each service with the exact same `RUNNER_SECRET` environment variable.

2. **Network URLs:**
   - **Internal (App and runners on Render Private Network):**
     Use Render private service hostnames:
     ```env
     RUNNER_URLS="http://coding-runner-1:4000,http://coding-runner-2:4000,http://coding-runner-3:4000"
     ```
   - **External (App on Vercel / external host):**
     Use Render public HTTPS URLs:
     ```env
     RUNNER_URLS="https://coding-runner-1.onrender.com,https://coding-runner-2.onrender.com,https://coding-runner-3.onrender.com"
     ```

3. **Keep-alive / Sleep Prevention:**
   - Render's free tier spins down services after 15 minutes of inactivity. For free tier pools, configure your keep-alive cron job to ping all runner URLs (or upgrade to the Starter tier for always-on instances).
