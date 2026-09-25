/**
 * The student's camera, during a test only.
 *
 * PRIVACY CONTRACT -- the camera video never leaves the student's browser:
 *  - the MediaStream from getUserMedia lives in memory and is shown in a local
 *    <video> element, nothing else;
 *  - it is never recorded (no MediaRecorder), never drawn to a canvas, never
 *    sent through fetch/XHR/WebSocket/FormData, never written anywhere;
 *  - it is stopped when the test ends or the page goes away.
 * The server only ever learns facts ("camera enabled", "camera stopped") as
 * proctor events. tests/unit/camera-privacy.test.ts enforces this contract.
 *
 * This is the only module that calls getUserMedia.
 */

export type CameraFailure = 'DENIED' | 'UNAVAILABLE' | 'IN_USE' | 'UNSUPPORTED';

export type CameraRequest = { ok: true; stream: MediaStream } | { ok: false; reason: CameraFailure };

/** Map a getUserMedia error to what the student can do about it. */
export function cameraFailureReason(error: unknown): CameraFailure {
  const name = (error as { name?: unknown })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'DENIED';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'IN_USE';
    case 'NotSupportedError':
    case 'TypeError':
      return 'UNSUPPORTED';
    default:
      // NotFoundError / DevicesNotFoundError / OverconstrainedError and anything unknown.
      return 'UNAVAILABLE';
  }
}

/** Student-facing explanation for each failure, with what to do next. */
export function cameraFailureMessage(reason: CameraFailure): string {
  switch (reason) {
    case 'DENIED':
      return 'Camera access was blocked. Camera access is mandatory for this test: click the camera icon in the address bar (or your browser’s site settings), allow the camera for this site, then press "Try again".';
    case 'IN_USE':
      return 'Your camera is being used by another application. Close any app using the camera (video calls, other tabs), then press "Try again".';
    case 'UNSUPPORTED':
      return 'This browser cannot open a camera on this page. Use an up-to-date Chrome, Edge or Firefox and open the test over https.';
    default:
      return 'No camera was found. Connect a camera (or enable the built-in one), then press "Try again".';
  }
}

/** Ask for the camera: video only, never audio. */
export async function requestCamera(): Promise<CameraRequest> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'UNSUPPORTED' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (!isStreamLive(stream)) {
      stopStream(stream);
      return { ok: false, reason: 'UNAVAILABLE' };
    }
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, reason: cameraFailureReason(error) };
  }
}

/** A stream counts as live while at least one enabled video track is still running. */
export function isStreamLive(stream: Pick<MediaStream, 'getVideoTracks'> | null | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
}

/** Release the camera: the light goes off and nothing is kept. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}
