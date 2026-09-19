# Architecture

The platform is split into a Next.js web app, PostgreSQL via Prisma, and a separate runner service.

1. A student authenticates through Auth.js/Google. The eventual sign-in callback will normalize the email and allow access only when it exists in `AllowedEmail`.
2. The exam route loads exam/question metadata and renders the Monaco-based editor, live preview iframe, console, timer, test results, and submit controls.
3. The browser sends only HTML/CSS/JS plus a question identifier to the web app's run endpoint. The web app resolves trusted server-side test data and forwards it to the isolated runner.
4. The runner will eventually execute hidden test specs in a sandboxed Docker container. Hidden specs and expected outputs are never returned to the browser.
5. Proctor events are eventually persisted in PostgreSQL. The admin monitor reads database-backed violation data rather than relying on client state.
6. Admin pages will eventually create questions/exams and provide live monitoring.

This scaffold deliberately leaves authentication enforcement, persistence, execution, live updates, and complete proctoring behavior as TODOs for follow-up PRs.
