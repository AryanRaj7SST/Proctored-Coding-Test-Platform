import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

const mockRunnerHealth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/runner-client', () => ({
  runnerHealth: mockRunnerHealth,
}));

describe('/api/ping (UptimeRobot shallow keepalive)', () => {
  it('GET returns 200 with status ok and pong message', async () => {
    const { GET } = await import('@/app/api/ping/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.message).toBe('pong');
    expect(data.timestamp).toBeDefined();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('HEAD returns 200 without a body', async () => {
    const { HEAD } = await import('@/app/api/ping/route');
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});

describe('/api/health (deep dependency probe)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns 200 when database and runner are healthy', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([1]);
    mockRunnerHealth.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      status: 'ok',
      checks: {
        database: 'ok',
        runner: 'ok',
      },
    });
  });

  it('GET returns 503 degraded when runner is down', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([1]);
    mockRunnerHealth.mockResolvedValueOnce({ ok: false });

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.checks.database).toBe('ok');
    expect(data.checks.runner).toBe('down');
  });

  it('GET returns 503 degraded when database throws', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection timeout'));
    mockRunnerHealth.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.checks.database).toBe('down');
    expect(data.checks.runner).toBe('ok');
  });

  it('HEAD returns 200 when dependencies are healthy', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([1]);
    mockRunnerHealth.mockResolvedValueOnce({ ok: true });

    const { HEAD } = await import('@/app/api/health/route');
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('HEAD returns 503 when a dependency is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    mockRunnerHealth.mockResolvedValueOnce({ ok: true });

    const { HEAD } = await import('@/app/api/health/route');
    const res = await HEAD();
    expect(res.status).toBe(503);
    expect(res.body).toBeNull();
  });
});
