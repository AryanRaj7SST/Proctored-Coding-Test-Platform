import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';
import { normalizeEmail, isValidEmail } from '@/lib/email';
import { parseAllowedEmailCsv, toCsv } from '@/lib/csv';

/**
 * The student roster (AllowedEmail): addresses pre-registered with a batch so
 * tests can be assigned by batch before those students first sign in.
 *
 * It is NOT an access list. Any Google-verified address may sign in, whether or
 * not it is on the roster, and the roster never sets a role or account state --
 * those live on the user account (services/users.ts). The table's legacy
 * `role` and `active` columns are no longer read or written.
 */

export async function addAllowedEmail(input: { email: string; batch?: string | null; note?: string | null }) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.allowedEmail.findUnique({ where: { email } });
  if (existing) throw conflict('That email is already on the roster.');
  return prisma.allowedEmail.create({
    data: { email, batch: input.batch ?? null, note: input.note ?? null },
  });
}

export async function getAllowedEmail(id: string) {
  const entry = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!entry) throw notFound('Roster entry not found.');
  return entry;
}

export async function updateAllowedEmail(id: string, input: { batch?: string | null; note?: string | null }) {
  const existing = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!existing) throw notFound('Roster entry not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.allowedEmail.update({ where: { id }, data: input });
    // The roster is where a batch is managed: keep a signed-in student's account in step.
    if (input.batch !== undefined) {
      await tx.user.updateMany({ where: { email: updated.email }, data: { batch: input.batch } });
    }
    return updated;
  });
}

/** Take an address off the roster. The person's account (if any) is not affected. */
export async function removeAllowedEmail(id: string) {
  const existing = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!existing) throw notFound('Roster entry not found.');
  await prisma.allowedEmail.delete({ where: { id } });
  return existing;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; message: string }[];
  duplicatesInFile: string[];
}

export async function importAllowedEmails(csv: string): Promise<ImportSummary> {
  const report = parseAllowedEmailCsv(csv, { normalizeEmail, isValidEmail });
  let created = 0;
  let updated = 0;

  // Chunked so a large upload does not hold one long transaction open.
  const chunkSize = 100;
  for (let i = 0; i < report.valid.length; i += chunkSize) {
    const chunk = report.valid.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.allowedEmail.upsert({
          where: { email: row.email },
          create: { email: row.email, batch: row.batch },
          update: { batch: row.batch },
        }),
      ),
    );
  }
  // Count precisely after the fact (upsert does not report which branch ran).
  const emails = report.valid.map((r) => r.email);
  const rows = await prisma.allowedEmail.findMany({
    where: { email: { in: emails } },
    select: { email: true, createdAt: true, updatedAt: true },
  });
  for (const row of rows) {
    if (Math.abs(row.createdAt.getTime() - row.updatedAt.getTime()) < 1000) created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    skipped: report.errors.length + report.duplicatesInFile.length,
    errors: report.errors.map((e) => ({ line: e.line, message: e.message })),
    duplicatesInFile: report.duplicatesInFile,
  };
}

export async function exportAllowedEmailsCsv(): Promise<string> {
  const rows = await prisma.allowedEmail.findMany({ orderBy: [{ batch: 'asc' }, { email: 'asc' }] });
  return toCsv(
    ['email', 'batch', 'note', 'createdAt'],
    rows.map((r) => [r.email, r.batch ?? '', r.note ?? '', r.createdAt.toISOString()]),
  );
}
