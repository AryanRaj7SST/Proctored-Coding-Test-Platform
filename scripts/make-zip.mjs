#!/usr/bin/env node
/**
 * Fallback packager used by scripts/make-zip.sh when the `zip` binary is not
 * on PATH. Walks the repo and writes a standard (store + deflate) ZIP using
 * only Node's built-in zlib -- no dependency needed.
 */

import { createWriteStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outPath = path.resolve(process.argv[2] ?? path.join(root, '..', 'proctored-coding-platform-final.zip'));

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'out', 'coverage', 'test-results',
  'playwright-report', 'blob-report', '.git', 'pgdata', '.idea', '.vscode',
]);
const EXCLUDE_FILES = new Set([
  '.env', '.env.local', '.DS_Store', 'next-env.d.ts', 'e2e-state.json', 'e2e-admin-state.json',
]);
const EXCLUDE_SUFFIXES = ['.log', '.tsbuildinfo', '.zip'];

function shouldSkip(name, isDir) {
  if (isDir) return EXCLUDE_DIRS.has(name);
  if (EXCLUDE_FILES.has(name)) return true;
  if (name.startsWith('.env.') && name.endsWith('.local')) return true;
  return EXCLUDE_SUFFIXES.some((suf) => name.endsWith(suf));
}

function walk(dir, base, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const rel = path.join(base, entry);
    const isDir = statSync(abs).isDirectory();
    if (shouldSkip(entry, isDir)) continue;
    if (isDir) walk(abs, rel, out);
    else out.push({ abs, rel: rel.split(path.sep).join('/') });
  }
  return out;
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dateNum =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dateNum };
}

const files = walk(root, '');
const out = createWriteStream(outPath);
const central = [];
let offset = 0;

function write(buf) {
  out.write(buf);
  offset += buf.length;
}

for (const file of files) {
  const data = readFileSync(file.abs);
  const compressed = deflateRawSync(data, { level: 9 });
  const useDeflate = compressed.length < data.length;
  const payload = useDeflate ? compressed : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);
  const { time, date } = dosDateTime(statSync(file.abs).mtime);
  const nameBuf = Buffer.from(file.rel, 'utf8');

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(time, 10);
  localHeader.writeUInt16LE(date, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(payload.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localOffset = offset;
  write(localHeader);
  write(nameBuf);
  write(payload);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(time, 12);
  centralHeader.writeUInt16LE(date, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(payload.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localOffset, 42);
  central.push(Buffer.concat([centralHeader, nameBuf]));
}

const centralStart = offset;
for (const entry of central) write(entry);
const centralSize = offset - centralStart;

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(central.length, 8);
end.writeUInt16LE(central.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(centralStart, 16);
end.writeUInt16LE(0, 20);
write(end);

out.end(() => {
  console.log(`Wrote ${outPath} (${files.length} files)`);
});
