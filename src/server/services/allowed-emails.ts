import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/http';
import { normalizeEmail, isValidEmail } from '@/lib/email';
import { parseAllowedEmailCsv, toCsv } from '@/lib/csv';

export async function addAllowedEmail(input: {
  email: string;
  role: 'STUDENT' | 'ADMIN';
  batch?: string | null;
  note?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.allowedEmail.findUnique({ where: { email } });
  if (existing) throw conflict('That email is already on the allowlist.');
  return prisma.allowedEmail.create({
    data: { email, role: input.role, batch: input.batch ?? null, note: input.note ?? null },
  });
}

export async function updateAllowedEmail(
  id: string,
  input: { role?: 'STUDENT' | 'ADMIN'; batch?: string | null; active?: boolean; note?: string | null },
) {
  const existing = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!existing) throw notFound('Allowlist entry not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.allowedEmail.update({ where: { id }, data: input });
    // Keep the User row consistent: a deactivated allowlist entry immediately
    // deactivates the account, and a role change applies on the next token refresh.
    await tx.user.updateMany({
      where: { email: updated.email },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.batch !== undefined ? { batch: input.batch } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    return updated;
  });
}

export async function removeAllowedEmail(id: string): Promise<void> {
  const existing = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!existing) throw notFound('Allowlist entry not found.');
  await prisma.$transaction([
    prisma.allowedEmail.delete({ where: { id } }),
    prisma.user.updateMany({ where: { email: existing.email }, data: { active: false } }),
  ]);
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
          create: { email: row.email, role: row.role, batch: row.batch, active: true },
          update: { role: row.role, batch: row.batch, active: true },
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
    ['email', 'role', 'batch', 'active', 'createdAt'],
    rows.map((r) => [r.email, r.role, r.batch ?? '', r.active ? 'true' : 'false', r.createdAt.toISOString()]),
  );
}
