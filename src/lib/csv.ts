/** Minimal, dependency-free RFC4180-ish CSV parsing and serialisation. */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const text = input.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    // Guard against CSV/formula injection in Excel & Sheets.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export interface AllowedEmailRow {
  email: string;
  batch: string | null;
}

export interface CsvImportReport {
  valid: AllowedEmailRow[];
  errors: { line: number; message: string; raw: string }[];
  duplicatesInFile: string[];
}

/**
 * Parse a student roster CSV.
 *
 * With a header row (first cell `email`, case-insensitive), columns are found
 * by name: `email`, optional `batch`, and an optional legacy `role`. Without a
 * header the legacy layout `email,role,batch` is assumed. The roster never
 * grants a role: a `role` cell may be blank or STUDENT, and a row asking for
 * ADMIN is reported as an error instead of being imported.
 */
export function parseAllowedEmailCsv(
  input: string,
  helpers: { normalizeEmail: (v: unknown) => string; isValidEmail: (v: unknown) => boolean },
  maxRows = 5000,
): CsvImportReport {
  const rows = parseCsv(input);
  const report: CsvImportReport = { valid: [], errors: [], duplicatesInFile: [] };
  if (rows.length === 0) {
    report.errors.push({ line: 0, message: 'The file is empty.', raw: '' });
    return report;
  }
  let start = 0;
  let columns = { email: 0, role: 1, batch: 2 };
  const header = (rows[0] as string[]).map((c) => c.trim().toLowerCase());
  if (header[0] === 'email') {
    start = 1;
    columns = { email: 0, role: header.indexOf('role'), batch: header.indexOf('batch') };
  }

  if (rows.length - start > maxRows) {
    report.errors.push({ line: 0, message: `Too many rows (limit ${maxRows}).`, raw: '' });
    return report;
  }

  const cell = (cells: string[], index: number) => (index >= 0 ? (cells[index] ?? '') : '').trim();
  const seen = new Set<string>();
  for (let i = start; i < rows.length; i += 1) {
    const cells = rows[i] as string[];
    const lineNo = i + 1;
    const raw = cells.join(',');
    const email = helpers.normalizeEmail(cells[columns.email]);
    const roleRaw = cell(cells, columns.role).toUpperCase();
    const batch = cell(cells, columns.batch);

    if (!email) {
      report.errors.push({ line: lineNo, message: 'Missing email.', raw });
      continue;
    }
    if (!helpers.isValidEmail(email)) {
      report.errors.push({ line: lineNo, message: `Invalid email address "${email}".`, raw });
      continue;
    }
    if (roleRaw === 'ADMIN') {
      report.errors.push({
        line: lineNo,
        message: 'The roster cannot grant administrator access. Change roles on the Students page.',
        raw,
      });
      continue;
    }
    if (roleRaw !== '' && roleRaw !== 'STUDENT') {
      report.errors.push({ line: lineNo, message: `Invalid role "${roleRaw}" (leave it blank).`, raw });
      continue;
    }
    if (batch.length > 64) {
      report.errors.push({ line: lineNo, message: 'Batch is too long (max 64 characters).', raw });
      continue;
    }
    if (seen.has(email)) {
      report.duplicatesInFile.push(email);
      continue;
    }
    seen.add(email);
    report.valid.push({ email, batch: batch || null });
  }
  return report;
}
