# Integration tests

These talk to a **real PostgreSQL database**. They are skipped automatically
when `DATABASE_URL` is not set, so `npm run test:integration` is safe to run
anywhere — it simply reports everything as skipped.

```bash
# against a throwaway database
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coding_platform_test"
export DIRECT_URL="$DATABASE_URL"   # Prisma migrates over DIRECT_URL (schema.prisma directUrl)
npm run db:deploy
npm run test:integration
```

They create and delete their own rows under a `it-` id prefix and never touch
seeded data.
