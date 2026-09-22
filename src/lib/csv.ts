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
  role: 'STUDENT' | 'ADMIN';
  batch: string | null;
}

export interface CsvImportReport {
  valid: AllowedEmailRow[];
  errors: { line: number; message: string; raw: string }[];
  duplicatesInFile: string[];
}

/**
 * Parse an allowlist CSV: `email,role,batch`.
 * A header row is optional and detected case-insensitively.
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
  const first = rows[0] as string[];
  if ((first[0] ?? '').trim().toLowerCase() === 'email') start = 1;

  if (rows.length - start > maxRows) {
    report.errors.push({ line: 0, message: `Too many rows (limit ${maxRows}).`, raw: '' });
    return report;
  }

  const seen = new Set<string>();
  for (let i = start; i < rows.length; i += 1) {
    const cells = rows[i] as string[];
    const lineNo = i + 1;
    const raw = cells.join(',');
    const email = helpers.normalizeEmail(cells[0]);
    const roleRaw = (cells[1] ?? 'STUDENT').trim().toUpperCase();
    const batch = (cells[2] ?? '').trim();

    if (!email) {
      report.errors.push({ line: lineNo, message: 'Missing email.', raw });
      continue;
    }
    if (!helpers.isValidEmail(email)) {
      report.errors.push({ line: lineNo, message: `Invalid email address "${email}".`, raw });
      continue;
    }
    if (roleRaw !== 'STUDENT' && roleRaw !== 'ADMIN') {
      report.errors.push({ line: lineNo, message: `Invalid role "${roleRaw}" (use STUDENT or ADMIN).`, raw });
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
    report.valid.push({ email, role: roleRaw, batch: batch || null });
  }
  return report;
}
