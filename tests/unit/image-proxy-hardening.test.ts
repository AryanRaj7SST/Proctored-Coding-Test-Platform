import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import dns from 'node:dns';

const authMock = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: string },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => (authMock.user ? { user: authMock.user } : null)),
}));

import { GET } from '@/app/api/image-proxy/route';
import { resetRateLimits } from '@/lib/rate-limit';

describe('Image Proxy Hardening (/api/image-proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
    authMock.user = { id: 'test-user-1', email: 'test@example.com', role: 'STUDENT' };

    // Default DNS lookup mock returns public IP
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(dns.promises, 'lookup') as any).mockImplementation(async (hostname: string) => {
      if (hostname === 'private.example.internal' || hostname === '127.0.0.1') {
        return [{ address: '127.0.0.1', family: 4 }];
      }
      if (hostname === 'rebinding.example.com') {
        return [{ address: '93.184.216.34', family: 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
    authMock.user = null;
  });

  it('rejects unauthenticated requests with 401', async () => {
    authMock.user = null;
    const req = new NextRequest('http://localhost:3000/api/image-proxy?url=https://example.com/test.png');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('enforces per-user rate limit', async () => {
    // Mock image response
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    });

    const req = () =>
      new NextRequest('http://localhost:3000/api/image-proxy?url=https://example.com/test.png');

    // Default limit is 30 per min
    let lastStatus = 200;
    for (let i = 0; i < 35; i++) {
      const res = await GET(req());
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    // Without Upstash configured in test env, rate-limit fallback fails open unless mocked or limit hit
    // So let's mock rateLimit to return allowed: false
    const rateLimitMod = await import('@/lib/rate-limit');
    vi.spyOn(rateLimitMod, 'rateLimit').mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetInMs: 30_000,
    });

    const rateLimitedRes = await GET(req());
    expect(rateLimitedRes.status).toBe(429);
  });

  it('resolves DNS once and fetches directly by validated IP with Host header (preventing DNS rebinding)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    });

    const req = new NextRequest(
      'http://localhost:3000/api/image-proxy?url=http://example.com/images/pic.png',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Must fetch by the validated IP address, NOT the original hostname
    expect(fetchSpy).toHaveBeenCalled();
    const [fetchedUrl, fetchOptions] = fetchSpy.mock.calls[0]!;
    const parsedFetchedUrl = new URL(String(fetchedUrl));

    expect(parsedFetchedUrl.hostname).toBe('93.184.216.34');
    expect(parsedFetchedUrl.pathname).toBe('/images/pic.png');

    // And must pass Host header matching the original host
    const headers = fetchOptions?.headers as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers['Host'] || headers['host']).toBe('example.com');
  });

  it('re-validates DNS on every redirect and fetches new target by its validated IP', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(dns.promises, 'lookup') as any).mockImplementation(async (hostname: string) => {
      if (hostname === 'first.com') {
        return [{ address: '93.184.216.34', family: 4 }];
      }
      if (hostname === 'second.com') {
        return [{ address: '93.184.216.35', family: 4 }];
      }
      if (hostname === 'evil-redirect.internal') {
        return [{ address: '127.0.0.1', family: 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });

    // 1st request -> 302 to http://second.com/img.png
    // 2nd request -> 200 image/png
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://second.com/img.png' },
        });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/image-proxy?url=http://first.com/start.png');
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Call 1 fetched 93.184.216.34 with Host: first.com
    const [url1, opt1] = fetchSpy.mock.calls[0]!;
    expect(new URL(String(url1)).hostname).toBe('93.184.216.34');
    expect((opt1?.headers as Record<string, string>)?.['Host']).toBe('first.com');

    // Call 2 fetched 93.184.216.35 with Host: second.com
    const [url2, opt2] = fetchSpy.mock.calls[1]!;
    expect(new URL(String(url2)).hostname).toBe('93.184.216.35');
    expect((opt2?.headers as Record<string, string>)?.['Host']).toBe('second.com');
  });

  it('blocks redirect to private IP address on redirect re-validation with 403', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(dns.promises, 'lookup') as any).mockImplementation(async (hostname: string) => {
      if (hostname === 'evil-redirect.internal') {
        return [{ address: '127.0.0.1', family: 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://evil-redirect.internal/secret.png' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/image-proxy?url=http://first.com/start.png');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
