# End-to-end tests

These drive a real browser against a running instance.

## What they cannot do without help

Every route behind `/dashboard`, `/exam/*` and `/admin/*` requires a **Google
sign-in**. Playwright cannot complete Google's OAuth flow unattended, and
scripting a real Google login would be both fragile and against Google's terms.

There are therefore two tiers:

| File                | Needs auth? | Runs with `npm run test:e2e`         |
| ------------------- | ----------- | ------------------------------------ |
| `public.spec.ts`    | no          | yes                                  |
| `exam-flow.spec.ts` | yes         | only when `E2E_STORAGE_STATE` is set |

## Running the authenticated tier (local only)

`scripts/e2e-session.ts` signs a person in without Google's page, using the
same post-Google rule as a real sign-in (new address → STUDENT, existing role
kept, deactivated refused), and writes a Playwright storage-state file. It
refuses unless the database and app are local, `NODE_ENV` is not production,
and it is given a throwaway secret that differs from the real `AUTH_SECRET`
(start the local server with that throwaway secret as its `AUTH_SECRET`).

```bash
export E2E_AUTH_SECRET="$(openssl rand -base64 48)"
export DATABASE_URL=postgresql://localhost:5432/<disposable-db>
AUTH_SECRET="$E2E_AUTH_SECRET" AUTH_URL=http://localhost:3100 npx next start -p 3100 &
npm run e2e:session -- student@example.com --base-url http://localhost:3100 --out student.json
npm run e2e:session -- admin@example.com   --base-url http://localhost:3100 --out admin.json
E2E_BASE_URL=http://localhost:3100 E2E_STORAGE_STATE=student.json \
  E2E_ADMIN_STORAGE_STATE=admin.json npm run test:e2e
```

The admin must already be an `ADMIN` in that database (seed with
`SEED_ADMIN_EMAIL`); the script never sets a role. Session files contain live
cookies — keep them out of the repository.

## Manual check: real Google sign-in

Google's OAuth page cannot be automated, so verify it by hand after changing
auth configuration: open `/login`, choose **Continue with Google**, sign in
with (1) a new Google account — it lands on the student dashboard as a
STUDENT — and (2) the administrator's account — it lands on `/admin`.
