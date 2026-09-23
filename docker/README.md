# Docker notes

## Files

| File                    | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `../docker-compose.yml` | Local development: PostgreSQL + runner       |
| `../Dockerfile`         | Application image for self-hosted deployment |
| `../runner/Dockerfile`  | Runner image (Playwright + Chromium)         |

## Network posture

The runner listens on `4000`. In production it must **not** be publicly
reachable: put it on a private network with the app, or firewall it to the
app's egress IP. Its only authentication is `RUNNER_SECRET`, so treat the port
as sensitive even though the service holds no data.

## The runner holds no secrets

The runner container is given exactly one secret, `RUNNER_SECRET`. It has no
`DATABASE_URL`, no Google credentials and no `AUTH_SECRET`. If the browser
sandbox were ever escaped, there is nothing in the container's environment to
steal and no network route to anything that matters.

## Stronger isolation

`RUNNER_ISOLATION=docker` starts a throwaway `--network=none --read-only`
container per run. This needs a Docker endpoint, which is itself a privilege.
Read `../docs/security.md` before enabling it.
