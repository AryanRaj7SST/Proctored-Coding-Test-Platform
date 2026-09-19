# Proctored Coding Test Platform

Scaffold for a proctored web-development coding-test platform for students and mentors. This PR intentionally contains placeholders and TODOs; real authentication, test execution, proctoring persistence, and live monitoring are follow-up work.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- Auth.js / NextAuth Google provider with JWT sessions
- Monaco Editor
- Separate Node + Express runner service

## Setup

```bash
git clone <repository-url>
cd proctored-coding-platform
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

The runner can be started separately with `npm run runner:dev` after installing its dependencies.

## Safety boundary

Student HTML/CSS/JS must not be executed by the Next.js server. The eventual runner will execute code inside a sandboxed Docker environment with timeout, resource limits, and no network. Hidden test specs remain server-side.

## Follow-up work

See `docs/roadmap.md` and the TODOs throughout the scaffold.
