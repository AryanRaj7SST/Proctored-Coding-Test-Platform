# Copilot Instructions

- TypeScript strict mode; small focused components; no default exports except Next.js pages/layouts.
- Never commit secrets; read config from environment variables.
- Hidden test specs and expected outputs stay server-side and are never returned to the browser.
- Always validate the session and role in every API route.
- Student code is never executed on the web app server, only in the isolated runner.
- Proctoring counts come from the database, not from client state.
- Keep real authentication, test execution, proctoring persistence, and live admin updates behind explicit TODOs until their follow-up PRs.
