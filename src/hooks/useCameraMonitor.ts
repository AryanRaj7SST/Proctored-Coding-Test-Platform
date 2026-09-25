'use client';

import * as React from 'react';
import { isStreamLive } from '@/lib/camera';

/** How often the track state is re-read. `ended` does not fire for every way a camera stops. */
const POLL_MS = 1000;

/**
 * Watch the camera stream while a test is running and report when it stops
 * (device unplugged, permission revoked, camera switched off, track ended).
 *
 * `onChange` fires on transitions only -- live -> stopped and stopped -> live --
 * so one interruption produces one report, however long it lasts. The stream
 * itself is only read locally; nothing about it is sent anywhere.
 */
export function useCameraMonitor(
  stream: MediaStream | null,
  enabled: boolean,
  onChange: (live: boolean) => void,
): boolean {
  const [live, setLive] = React.useState(() => isStreamLive(stream));
  const liveRef = React.useRef(live);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const now = isStreamLive(stream);
      if (now === liveRef.current) return;
      liveRef.current = now;
      setLive(now);
      onChangeRef.current(now);
    };
    check();
    const tracks = stream?.getVideoTracks() ?? [];
    tracks.forEach((t) => {
      t.addEventListener('ended', check);
      t.addEventListener('mute', check);
      t.addEventListener('unmute', check);
    });
    const id = setInterval(check, POLL_MS);
    return () => {
      clearInterval(id);
      tracks.forEach((t) => {
        t.removeEventListener('ended', check);
        t.removeEventListener('mute', check);
        t.removeEventListener('unmute', check);
      });
    };
  }, [stream, enabled]);

  return live;
}
