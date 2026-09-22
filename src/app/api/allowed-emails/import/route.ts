import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { badRequest, handler, ok, readText, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { importAllowedEmails } from '@/server/services/allowed-emails';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Bulk CSV import: `email,role,batch`.
 * Accepts either a raw text/csv body or a multipart upload from the browser.
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();

  const limit = rateLimit(`allowlist-import:${admin.id}`, 5, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many imports. Please wait a moment.');

  const contentType = req.headers.get('content-type') ?? '';
  let csv: string;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw badRequest('Attach a CSV file in the "file" field.');
    if (file.size > 2_000_000) throw badRequest('That CSV is too large (2 MB maximum).');
    csv = await file.text();
  } else {
    csv = await readText(req, 2_000_000);
  }

  if (!csv.trim()) throw badRequest('The CSV file is empty.');

  const summary = await importAllowedEmails(csv);
  await recordAudit({
    userId: admin.id,
    action: 'allowlist.imported',
    entity: 'AllowedEmail',
    metadata: { created: summary.created, updated: summary.updated, skipped: summary.skipped },
  });
  return ok(summary);
});
