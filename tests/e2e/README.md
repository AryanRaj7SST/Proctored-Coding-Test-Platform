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

## Running the authenticated tier

1. Start the stack (`npm run validate:stack`, or `docker compose up` + `npm run dev`).
2. Sign in once as a seeded student in a normal browser.
3. Save that session:

```bash
npx playwright open --save-storage=e2e-state.json http://localhost:3000/login
# complete the Google sign-in in the window that opens, then close it
export E2E_STORAGE_STATE=$PWD/e2e-state.json
npm run test:e2e
```

`e2e-state.json` contains a live session cookie — it is in `.gitignore` and must
never be committed.
