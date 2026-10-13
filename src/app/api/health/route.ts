import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runnerHealth } from '@/lib/runner-client';

export const dynamic = 'force-dynamic';

/**
 * Liveness + dependency probe. Deliberately returns no version, hostname or
 * configuration detail -- it is reachable without authentication.
 */
async function performHealthChecks() {
  const checks: Record<string, 'ok' | 'down'> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'down';
  }

  try {
    const runner = await runnerHealth();
    checks.runner = runner.ok ? 'ok' : 'down';
  } catch {
    checks.runner = 'down';
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');
  return { healthy, checks };
}

/**
 * Liveness + dependency probe. Deliberately returns no version, hostname or
 * configuration detail -- it is reachable without authentication.
 * Supports both GET and HEAD for monitoring tools like UptimeRobot.
 */
export async function GET() {
  const { healthy, checks } = await performHealthChecks();
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}

export async function HEAD() {
  const { healthy } = await performHealthChecks();
  return new NextResponse(null, {
    status: healthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
