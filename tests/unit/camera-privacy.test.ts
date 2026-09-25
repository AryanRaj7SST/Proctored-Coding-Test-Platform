import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { proctorEventInput } from '@/lib/validation';

/**
 * The camera video must never leave the student's browser. These checks read
 * the source itself, so a future change that records, captures or uploads
 * camera video fails the build -- not just a code review.
 */
const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['src', 'shared', 'runner/src', 'prisma'];

function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' || d.name === 'migrations' ? [] : files(rel);
    return /\.(ts|tsx|js|mjs|prisma)$/.test(d.name) ? [rel] : [];
  });
}
/** Code only: comments may name forbidden APIs (to forbid them) without using them. */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sources = SOURCE_DIRS.flatMap(files).map((f) => ({
  file: f,
  text: stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')),
}));
const offenders = (re: RegExp) => sources.filter((s) => re.test(s.text)).map((s) => s.file);

describe('camera privacy: no video is recorded, captured, uploaded or stored', () => {
  it('scans a real codebase', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('nothing records the camera (no MediaRecorder) or captures frames from it', () => {
    expect(offenders(/\bMediaRecorder\b/)).toEqual([]);
    expect(offenders(/\bcaptureStream\s*\(/)).toEqual([]);
    expect(offenders(/\bImageCapture\b/)).toEqual([]);
    expect(offenders(/\.toDataURL\s*\(|\.toBlob\s*\(/)).toEqual([]);
    expect(offenders(/\bRTCPeerConnection\b/)).toEqual([]);
  });

  it('only src/lib/camera.ts opens the camera, and it asks for video without audio', () => {
    expect(offenders(/getUserMedia\s*\(/)).toEqual(['src/lib/camera.ts']);
    const camera = sources.find((s) => s.file === 'src/lib/camera.ts')!.text;
    expect(camera).toMatch(/getUserMedia\(\{ video: true, audio: false \}\)/);
    // The camera module talks to no server at all.
    expect(camera).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|@\/lib\/api/);
  });

  it('the stream is only ever attached to a local <video> element', () => {
    const users = offenders(/\bsrcObject\b/);
    expect(users).toEqual(['src/components/proctor/CameraPreview.tsx']);
  });

  it('there is no video field, model or upload endpoint', () => {
    const schema = sources.find((s) => s.file === 'prisma/schema.prisma')!.text;
    expect(schema).not.toMatch(/\b(video|frame|snapshot_image|webcam|recording)\w*\s+(Bytes|String)/i);
    expect(schema).not.toMatch(/\bBytes\b/);
    const routes = sources.filter((s) => /^src\/app\/api\/.*route\.ts$/.test(s.file));
    // The only multipart upload in the app is the roster CSV import.
    expect(routes.filter((r) => /formData\(\)/.test(r.text)).map((r) => r.file)).toEqual([
      'src/app/api/allowed-emails/import/route.ts',
    ]);
    expect(routes.map((r) => r.file).filter((f) => /camera|video|webcam|frame|snapshot/i.test(f))).toEqual(
      [],
    );
  });

  it('a proctor event cannot smuggle an image: only known types and short scalar metadata', () => {
    const base = { examId: 'c0000000000000000000000000', type: 'CAMERA_PERMISSION_GRANTED' };
    expect(proctorEventInput.safeParse(base).success).toBe(true);
    expect(proctorEventInput.safeParse({ ...base, type: 'CAMERA_FRAME' }).success).toBe(false);
    const frame = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
    expect(proctorEventInput.safeParse({ ...base, metadata: { frame } }).success).toBe(false);
    expect(proctorEventInput.safeParse({ ...base, metadata: { frame: ['x'] } }).success).toBe(false);
  });
});
