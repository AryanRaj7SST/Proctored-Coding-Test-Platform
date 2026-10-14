import { NextResponse, type NextRequest } from 'next/server';
import { MAX_IMAGE_BYTES, FETCH_TIMEOUT_MS, MAX_REDIRECTS, resolveAndValidateHost } from '@/lib/image-proxy';
import { requireAuth } from '@/lib/authz';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: 'You must sign in to continue.' }, { status: 401 });
  }

  const limit = await rateLimit(`image-proxy:${user.id}`, env.imageProxyRateLimitPerMin, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many image requests. Please try again later.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');

  if (!target || !target.trim()) {
    return NextResponse.json({ error: 'Missing required "url" query parameter.' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target.trim());
  } catch {
    return NextResponse.json({ error: 'Malformed URL provided.' }, { status: 400 });
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return NextResponse.json(
      { error: `Invalid URL protocol "${targetUrl.protocol}". Only http: and https: are allowed.` },
      { status: 400 },
    );
  }

  if (targetUrl.username || targetUrl.password) {
    return NextResponse.json({ error: 'URLs with embedded credentials are not allowed.' }, { status: 400 });
  }

  let currentUrl = targetUrl;
  let response: Response | null = null;
  let redirectCount = 0;

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      const validation = await resolveAndValidateHost(currentUrl.hostname);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }

      const targetFetchUrl = new URL(currentUrl.toString());
      const originalHost = targetFetchUrl.host;
      targetFetchUrl.hostname = validation.ip.includes(':') ? `[${validation.ip}]` : validation.ip;

      response = await fetch(targetFetchUrl.toString(), {
        method: 'GET',
        headers: {
          Host: originalHost,
          Accept: 'image/*,*/*',
          'User-Agent': 'Mozilla/5.0 (compatible; ProctoredCodingPlatform/1.0; +image-proxy)',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      // Handle redirects manually to prevent SSRF redirect bypass
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return NextResponse.json(
            { error: 'Upstream server returned redirect with no Location header.' },
            { status: 502 },
          );
        }

        try {
          currentUrl = new URL(location, currentUrl);
        } catch {
          return NextResponse.json(
            { error: 'Upstream server returned malformed redirect location.' },
            { status: 502 },
          );
        }

        if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
          return NextResponse.json(
            { error: `Redirect to unsupported protocol "${currentUrl.protocol}".` },
            { status: 400 },
          );
        }

        redirectCount++;
        continue;
      }

      break;
    }

    if (redirectCount > MAX_REDIRECTS) {
      return NextResponse.json({ error: 'Too many redirects from upstream image server.' }, { status: 502 });
    }

    if (!response) {
      return NextResponse.json({ error: 'Failed to obtain response from upstream server.' }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Upstream image server responded with HTTP ${response.status}: ${response.statusText || 'Error'}`,
        },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json(
        { error: `Target URL did not return an image Content-Type (received: "${contentType || 'none'}").` },
        { status: 415 },
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          {
            error: `Image size (${(contentLength / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of 5 MB.`,
          },
          { status: 413 },
        );
      }
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Upstream image response body was empty.' }, { status: 502 });
    }

    // Stream the body with a runtime size limit safeguard
    let bytesTransferred = 0;
    const sizeLimiter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytesTransferred += chunk.byteLength;
        if (bytesTransferred > MAX_IMAGE_BYTES) {
          controller.error(new Error('Image size exceeded maximum allowed limit of 5 MB during transfer.'));
          return;
        }
        controller.enqueue(chunk);
      },
    });

    const stream = response.body.pipeThrough(sizeLimiter);

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return NextResponse.json({ error: 'Image fetch timed out after 5 seconds.' }, { status: 504 });
      }
      return NextResponse.json({ error: `Failed to fetch image: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred while proxying the image.' },
      { status: 500 },
    );
  }
}
