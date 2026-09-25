import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cameraFailureMessage,
  cameraFailureReason,
  isStreamLive,
  requestCamera,
  stopStream,
} from '@/lib/camera';

const track = (over: Partial<MediaStreamTrack> = {}) =>
  ({ readyState: 'live', enabled: true, stop: vi.fn(), ...over }) as unknown as MediaStreamTrack;
const stream = (tracks: MediaStreamTrack[]) =>
  ({ getVideoTracks: () => tracks, getTracks: () => tracks }) as unknown as MediaStream;

describe('camera failures are explained, never ignored', () => {
  it('maps getUserMedia errors to what the student can do', () => {
    expect(cameraFailureReason({ name: 'NotAllowedError' })).toBe('DENIED');
    expect(cameraFailureReason({ name: 'SecurityError' })).toBe('DENIED');
    expect(cameraFailureReason({ name: 'NotFoundError' })).toBe('UNAVAILABLE');
    expect(cameraFailureReason({ name: 'OverconstrainedError' })).toBe('UNAVAILABLE');
    expect(cameraFailureReason({ name: 'NotReadableError' })).toBe('IN_USE');
    expect(cameraFailureReason({ name: 'NotSupportedError' })).toBe('UNSUPPORTED');
    expect(cameraFailureReason(new Error('weird'))).toBe('UNAVAILABLE');
  });

  it('every failure has instructions', () => {
    for (const reason of ['DENIED', 'UNAVAILABLE', 'IN_USE', 'UNSUPPORTED'] as const) {
      expect(cameraFailureMessage(reason).length).toBeGreaterThan(20);
    }
    expect(cameraFailureMessage('DENIED')).toMatch(/mandatory/i);
    expect(cameraFailureMessage('DENIED')).toMatch(/try again/i);
  });
});

describe('camera stream state', () => {
  it('is live only while an enabled video track is running', () => {
    expect(isStreamLive(stream([track()]))).toBe(true);
    expect(isStreamLive(stream([track({ readyState: 'ended' })]))).toBe(false);
    expect(isStreamLive(stream([track({ enabled: false })]))).toBe(false);
    expect(isStreamLive(stream([]))).toBe(false);
    expect(isStreamLive(null)).toBe(false);
  });

  it('stopping releases every track', () => {
    const t = track();
    stopStream(stream([t]));
    expect(t.stop).toHaveBeenCalled();
  });
});

describe('requestCamera', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for video only -- never audio', async () => {
    const getUserMedia = vi.fn(async () => stream([track()]));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const result = await requestCamera();
    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });

  it('a denial or a missing device is a failure, not a silent pass', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject({ name: 'NotAllowedError' })) },
    });
    expect(await requestCamera()).toEqual({ ok: false, reason: 'DENIED' });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject({ name: 'NotFoundError' })) },
    });
    expect(await requestCamera()).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('a stream with no running video track is treated as unavailable (and released)', async () => {
    const dead = track({ readyState: 'ended' });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream([dead])) } });
    expect(await requestCamera()).toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(dead.stop).toHaveBeenCalled();
  });

  it('a browser without mediaDevices is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestCamera()).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });
});
