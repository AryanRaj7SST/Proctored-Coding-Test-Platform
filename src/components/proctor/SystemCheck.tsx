'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { apiPost } from '@/lib/api';
import { cameraFailureMessage, requestCamera, type CameraFailure } from '@/lib/camera';
import { useCameraMonitor } from '@/hooks/useCameraMonitor';
import { CameraPreview } from './CameraPreview';
import { ProctorChecklist } from './ProctorChecklist';

/**
 * Pre-test system check. Nothing starts until every mandatory check passes:
 * the camera is granted and streaming, the page is fullscreen, the browser
 * can do both, and the server says this test can be started (or resumed).
 *
 * This screen never starts the timer: the sitting starts (server-side) only
 * when the student presses Start and the workspace calls /start. Resuming an
 * open sitting goes through this check again -- its timer keeps running on
 * the server, as it always has.
 */
export function SystemCheck({
  examId,
  title,
  durationMinutes,
  resuming,
  session,
  stream,
  onStream,
  onStart,
}: {
  examId: string;
  title: string;
  durationMinutes: number;
  resuming: boolean;
  session: { ready: boolean; message: string | null };
  stream: MediaStream | null;
  onStream: (stream: MediaStream | null) => void;
  onStart: () => void;
}) {
  const router = useRouter();
  const [cameraBusy, setCameraBusy] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<CameraFailure | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [fullscreenError, setFullscreenError] = React.useState<string | null>(null);
  const [browser, setBrowser] = React.useState<{ ok: boolean; hint: string | null }>({
    ok: false,
    hint: null,
  });
  const [starting, setStarting] = React.useState(false);
  const reported = React.useRef(new Set<string>());

  const cameraLive = useCameraMonitor(stream, true, () => {});

  const reportFailure = React.useCallback(
    (reason: CameraFailure) => {
      const type = reason === 'DENIED' ? 'CAMERA_PERMISSION_DENIED' : 'CAMERA_UNAVAILABLE';
      if (reported.current.has(type)) return;
      reported.current.add(type);
      // A fact for the proctoring timeline; no sitting has started yet unless resuming.
      void apiPost('/api/proctor-events', { examId, type, metadata: { reason } }).catch(() => {});
    },
    [examId],
  );

  const enableCamera = React.useCallback(async () => {
    setCameraBusy(true);
    const result = await requestCamera();
    setCameraBusy(false);
    if (result.ok) {
      setCameraError(null);
      onStream(result.stream);
    } else {
      setCameraError(result.reason);
      reportFailure(result.reason);
    }
  }, [onStream, reportFailure]);

  // Browser readiness, fullscreen state, and a first camera request on arrival.
  React.useEffect(() => {
    const secure = window.isSecureContext;
    const media = Boolean(navigator.mediaDevices?.getUserMedia);
    const fs = Boolean(document.fullscreenEnabled);
    setBrowser({
      ok: secure && media && fs,
      hint: !secure
        ? 'Open the test over https.'
        : !media
          ? 'This browser cannot use a camera. Use an up-to-date Chrome, Edge or Firefox.'
          : !fs
            ? 'This browser does not allow fullscreen here. Use an up-to-date Chrome, Edge or Firefox.'
            : null,
    });
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    onFs();
    document.addEventListener('fullscreenchange', onFs);
    if (!stream) void enableCamera();
    return () => document.removeEventListener('fullscreenchange', onFs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const enterFullscreen = async () => {
    setFullscreenError(null);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        'Your browser did not switch to fullscreen. Allow fullscreen for this site (or press F11 on Windows, Ctrl+Cmd+F on a Mac), then press the button again.',
      );
    }
    setFullscreen(Boolean(document.fullscreenElement));
  };

  const ready = cameraLive && fullscreen && session.ready && browser.ok;

  const items = [
    {
      label: 'Camera access',
      ok: Boolean(stream) && !cameraError,
      hint: cameraError ? cameraFailureMessage(cameraError) : cameraBusy ? 'Waiting for permission…' : null,
    },
    {
      label: 'Camera stream active',
      ok: cameraLive,
      hint: stream ? 'The camera stopped. Press "Try again".' : null,
    },
    {
      label: 'Fullscreen enabled',
      ok: fullscreen,
      hint: fullscreenError ?? 'Fullscreen is required to take this test.',
    },
    { label: 'Test session ready', ok: session.ready, hint: session.message },
    { label: 'Browser readiness', ok: browser.ok, hint: browser.hint },
  ];

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl bg-ink-850 p-6 ring-1 ring-ink-700 sm:p-8">
        <p className="text-xs uppercase tracking-wide text-slate-400">System check</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-50">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {resuming
            ? 'Your test is already in progress and its timer is running on the server. Complete these checks to resume.'
            : `${durationMinutes} minutes. The timer starts only when you press Start Test.`}
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <ProctorChecklist items={items} />
          <div className="space-y-3">
            <CameraPreview stream={stream} live={cameraLive} />
            <p className="text-xs leading-5 text-slate-400">
              Your camera is shown only here, on your screen. The video is never recorded, uploaded or stored,
              and the camera turns off when the test ends.
            </p>
            {!cameraLive ? (
              <Button size="sm" variant="secondary" onClick={() => void enableCamera()} loading={cameraBusy}>
                {stream || cameraError ? 'Try again' : 'Allow camera'}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-md bg-ink-900 p-4 ring-1 ring-ink-700">
          <p className="text-sm font-medium text-slate-100">Fullscreen is required to take this test.</p>
          <p className="mt-1 text-xs text-slate-400">
            Leaving fullscreen, switching tabs or windows, and copy/paste are recorded and shown to your
            mentor.
          </p>
          {!fullscreen ? (
            <Button className="mt-3" size="sm" onClick={() => void enterFullscreen()}>
              Enter Fullscreen &amp; Continue
            </Button>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
          <Button
            onClick={() => {
              if (starting || !ready) return;
              setStarting(true);
              onStart();
            }}
            disabled={!ready || starting}
            loading={starting}
          >
            {resuming ? 'Resume Test' : 'Start Test'}
          </Button>
        </div>
      </div>
    </main>
  );
}
