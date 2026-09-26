import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import dns from 'node:dns';
import { GET } from '@/app/api/image-proxy/route';
import { isPrivateOrReservedIp, isBlockedHostname } from '@/lib/image-proxy';

describe('Image Proxy Route (/api/image-proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Cast spy to handle overloaded dns.promises.lookup signature (LookupAddress vs LookupAddress[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(dns.promises, 'lookup') as any).mockImplementation(async (hostname: string) => {
      if (hostname === 'private.example.internal') {
        return [{ address: '10.0.0.99', family: 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSRF Protection Helpers', () => {
    it('identifies private, loopback, and link-local IPv4 addresses', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('127.255.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.255.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);

      // Public IPs
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    });

    it('identifies private, loopback, and link-local IPv6 addresses', () => {
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('::')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIp('fd12::1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);

      // Public IPv6
      expect(isPrivateOrReservedIp('2001:4860:4860::8888')).toBe(false);
      expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('identifies blocked hostnames and suffixes', () => {
      expect(isBlockedHostname('localhost')).toBe(true);
      expect(isBlockedHostname('app.localhost')).toBe(true);
      expect(isBlockedHostname('service.local')).toBe(true);
      expect(isBlockedHostname('database.internal')).toBe(true);
      expect(isBlockedHostname('router.lan')).toBe(true);
      expect(isBlockedHostname('metadata.google.internal')).toBe(true);
      expect(isBlockedHostname('127.0.0.1')).toBe(true);
      expect(isBlockedHostname('169.254.169.254')).toBe(true);

      // Legitimate external hosts
      expect(isBlockedHostname('s7d1.scene7.com')).toBe(false);
      expect(isBlockedHostname('d3dyfaf3iutrxo.cloudfront.net')).toBe(false);
      expect(isBlockedHostname('images.unsplash.com')).toBe(false);
    });
  });

  describe('GET handler input validation', () => {
    it('returns 400 when url query parameter is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/image-proxy');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing required "url"/i);
    });

    it('returns 400 when url is malformed', async () => {
      const req = new NextRequest('http://localhost:3000/api/image-proxy?url=not_a_valid_url');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/malformed url/i);
    });

    it('returns 400 for non-http(s) protocols (javascript, data, file)', async () => {
      for (const badUrl of [
        'javascript:alert(1)',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        'file:///etc/passwd',
        'ftp://example.com/test.png',
      ]) {
        const req = new NextRequest(
          `http://localhost:3000/api/image-proxy?url=${encodeURIComponent(badUrl)}`,
        );
        const res = await GET(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/only http: and https: are allowed/i);
      }
    });

    it('returns 400 for URLs with embedded credentials', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=http://user:pass@example.com/pic.png',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/embedded credentials/i);
    });
  });

  describe('SSRF Protection in handler', () => {
    it('rejects requests to localhost and 127.0.0.1 with 403', async () => {
      const reqLocalhost = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=http://localhost/secret.png',
      );
      const resLocalhost = await GET(reqLocalhost);
      expect(resLocalhost.status).toBe(403);

      const reqLoopback = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=http://127.0.0.1/secret.png',
      );
      const resLoopback = await GET(reqLoopback);
      expect(resLoopback.status).toBe(403);
    });

    it('rejects requests to cloud metadata endpoint 169.254.169.254 with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=http://169.254.169.254/latest/meta-data',
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/access to private or internal.*forbidden/i);
    });

    it('rejects requests to private 10.x, 192.168.x, 172.16-31.x ranges with 403', async () => {
      const privateIps = ['10.0.1.5', '192.168.1.100', '172.20.5.1'];
      for (const ip of privateIps) {
        const req = new NextRequest(`http://localhost:3000/api/image-proxy?url=http://${ip}/img.jpg`);
        const res = await GET(req);
        expect(res.status).toBe(403);
      }
    });

    it('rejects domain names resolving via DNS to a private IP with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=http://private.example.internal/secret.png',
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/access to private or internal.*forbidden/i);
    });
  });

  describe('Content-Type and Size Validation', () => {
    it('rejects non-image Content-Type with 415', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('<html><body>Not an image</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );

      const req = new NextRequest(
        'http://localhost:3000/api/image-proxy?url=https://example.com/not-an-image',
      );
      const res = await GET(req);
      expect(res.status).toBe(415);
      const json = await res.json();
      expect(json.error).toMatch(/did not return an image content-type/i);
    });

    it('rejects oversized images based on Content-Length header with 413', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(new Uint8Array(10), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(10 * 1024 * 1024), // 10 MB > 5 MB
          },
        }),
      );

      const req = new NextRequest('http://localhost:3000/api/image-proxy?url=https://example.com/large.jpg');
      const res = await GET(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error).toMatch(/exceeds maximum allowed size/i);
    });

    it('successfully streams valid image and sets caching headers', async () => {
      const mockImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockImageBytes, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(mockImageBytes.length),
          },
        }),
      );

      const req = new NextRequest('http://localhost:3000/api/image-proxy?url=https://example.com/valid.png');
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');

      const body = await res.arrayBuffer();
      expect(new Uint8Array(body)).toEqual(mockImageBytes);
    });

    it('returns 504 on fetch timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'TimeoutError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

      const req = new NextRequest('http://localhost:3000/api/image-proxy?url=https://example.com/slow.png');
      const res = await GET(req);
      expect(res.status).toBe(504);
      const json = await res.json();
      expect(json.error).toMatch(/timed out/i);
    });
  });
});
