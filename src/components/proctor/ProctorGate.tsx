'use client';

import * as React from 'react';
import { ProctorChecklist } from './ProctorChecklist';

/**
 * Blocks the workspace while a mandatory condition is not met during the test:
 * fullscreen is off, or the camera is not streaming. It cannot be dismissed,
 * only resolved -- and resolving needs a click, because browsers only enter
 * fullscreen or re-open a camera from a user gesture. The student's work is
 * untouched (it autosaves) and the server-side timer keeps running.
 */
export function ProctorGate({
  fullscreen,
  camera,
  cameraError,
  busy,
  onFullscreen,
  onCamera,
}: {
  fullscreen: boolean;
  camera: boolean;
  cameraError: string | null;
  busy: boolean;
  onFullscreen: () => void;
  onCamera: () => void;
}) {
  const primary = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => primary.current?.focus(), [fullscreen, camera]);

  const title = !camera ? '⚠ Camera Required' : '⚠ Fullscreen Required';
  const message = !camera
    ? 'Your camera is not active. Camera access is required to continue. This has been recorded.'
    : 'You exited fullscreen. Fullscreen is mandatory during this test: return to fullscreen to continue. This has been recorded.';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="proctor-gate-title"
      aria-describedby="proctor-gate-message"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/85 px-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="proctor-gate-title" className="text-base font-semibold text-rose-700">
          {title}
        </h2>
        <p id="proctor-gate-message" className="mt-2 text-sm text-slate-700">
          {message}
        </p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <ProctorChecklist
            tone="light"
            items={[
              { label: 'Camera active', ok: camera, hint: cameraError },
              { label: 'Fullscreen', ok: fullscreen, hint: null },
            ]}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Your work is saved. The timer keeps running on the server while this is shown.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!camera ? (
            <button
              ref={primary}
              type="button"
              disabled={busy}
              onClick={onCamera}
              className="rounded-[4px] bg-[#0066d6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0052b3] disabled:opacity-60"
            >
              {busy ? 'Opening camera…' : 'Re-enable camera'}
            </button>
          ) : null}
          {!fullscreen ? (
            <button
              ref={camera ? primary : undefined}
              type="button"
              onClick={onFullscreen}
              className="rounded-[4px] bg-[#0066d6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0052b3]"
            >
              Return to fullscreen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
