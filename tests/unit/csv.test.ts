import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, parseAllowedEmailCsv } from '@/lib/csv';
import { normalizeEmail, isValidEmail } from '@/lib/email';

const helpers = { normalizeEmail, isValidEmail };

describe('parseCsv', () => {
  it('parses quoted fields containing commas and newlines', () => {
    const rows = parseCsv('a,"b,c","d\ne"\n1,2,3\n');
    expect(rows[0]).toEqual(['a', 'b,c', 'd\ne']);
    expect(rows[1]).toEqual(['1', '2', '3']);
  });

  it('handles escaped double quotes', () => {
    expect(parseCsv('"say ""hi""",x')[0]).toEqual(['say "hi"', 'x']);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('toCsv', () => {
  it('quotes values that need it', () => {
    const csv = toCsv(['a', 'b'], [['plain', 'has,comma']]);
    expect(csv).toContain('"has,comma"');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A cell starting with = + - @ is executed by Excel/Sheets on open.
    const csv = toCsv(['name'], [['=cmd|/c calc']]);
    expect(csv).not.toMatch(/^=/m);
    expect(csv).toContain('cmd|/c calc');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toContain(',');
  });
});

describe('parseAllowedEmailCsv', () => {
  it('accepts a header row and normalises addresses', () => {
    const report = parseAllowedEmailCsv('email,role,batch\n  Student@Example.COM ,STUDENT,2029\n', helpers);
    expect(report.valid).toEqual([{ email: 'student@example.com', batch: '2029' }]);
    expect(report.errors).toHaveLength(0);
  });

  it('finds columns by header name, so an exported roster re-imports as-is', () => {
    const report = parseAllowedEmailCsv('email,batch,note,createdAt\na@b.com,2029,,2026-01-01\n', helpers);
    expect(report.valid).toEqual([{ email: 'a@b.com', batch: '2029' }]);
  });

  it('works without a header row (legacy email,role,batch layout)', () => {
    const report = parseAllowedEmailCsv('a@b.com\nc@d.com,STUDENT,B1\n', helpers);
    expect(report.valid).toEqual([
      { email: 'a@b.com', batch: null },
      { email: 'c@d.com', batch: 'B1' },
    ]);
  });

  it('never imports a role: rows asking for ADMIN are reported, not granted', () => {
    const report = parseAllowedEmailCsv('email,role\nboss@example.com,ADMIN\nok@example.com,\n', helpers);
    expect(report.valid).toEqual([{ email: 'ok@example.com', batch: null }]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.message).toMatch(/cannot grant administrator access/i);
    expect(parseAllowedEmailCsv('boss@example.com,admin\n', helpers).valid).toHaveLength(0);
  });

  it('reports the line number of each bad row and keeps the good ones', () => {
    const report = parseAllowedEmailCsv(
      'email,role\ngood@example.com\nnot-an-email\nx@y.com,WIZARD\n',
      helpers,
    );
    expect(report.valid.map((v) => v.email)).toEqual(['good@example.com']);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]?.line).toBe(3);
    expect(report.errors[1]?.message).toMatch(/role/i);
  });

  it('flags duplicates inside the file instead of importing them twice', () => {
    const report = parseAllowedEmailCsv('email\na@b.com\nA@B.com\n', helpers);
    expect(report.valid).toHaveLength(1);
    expect(report.duplicatesInFile).toEqual(['a@b.com']);
  });

  it('refuses an oversized file rather than timing out the request', () => {
    const rows = Array.from({ length: 30 }, (_, i) => `u${i}@example.com`).join('\n');
    const report = parseAllowedEmailCsv(`email\n${rows}\n`, helpers, 10);
    expect(report.valid).toHaveLength(0);
    expect(report.errors[0]?.message).toMatch(/too many rows/i);
  });

  it('reports an empty file clearly', () => {
    expect(parseAllowedEmailCsv('', helpers).errors[0]?.message).toMatch(/empty/i);
  });
});
