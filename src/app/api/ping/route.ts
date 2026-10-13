import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Lightweight ping endpoint for uptime monitors (like UptimeRobot)
 * and liveness probes. Returns 200 OK without touching the database
 * or background services.
 *
 * Supports both GET and HEAD requests.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      message: 'pong',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
