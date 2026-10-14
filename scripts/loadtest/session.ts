import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/prisma';

export interface ProvisionedStudent {
  index: number;
  id: string;
  email: string;
  name: string;
  cookieHeader: string;
}

/** Read AUTH_SECRET from environment or fallback to .env */
export function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const envFile = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envFile)) {
    const line = fs
      .readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*AUTH_SECRET\s*=/.test(l));
    const parsed = line
      ?.replace(/^\s*AUTH_SECRET\s*=\s*/, '')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (parsed) return parsed;
  }
  throw new Error(
    'AUTH_SECRET is required to sign load-test session cookies. Set AUTH_SECRET in your environment.',
  );
}

/**
 * Provision simulated student accounts in the database and mint session cookies.
 * This ensures every student is a valid user and has an assignment to the exam.
 */
export async function provisionStudents({
  count,
  examId,
  baseUrl,
  authSecret,
  runId = 'default',
}: {
  count: number;
  examId: string;
  baseUrl: string;
  authSecret: string;
  runId?: string;
}): Promise<ProvisionedStudent[]> {
  const isSecure = baseUrl.startsWith('https://');
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token';
  const maxAge = 2 * 60 * 60; // 2 hours

  console.log(`[Setup] Provisioning ${count} simulated students for exam ${examId} (runId: ${runId})...`);

  const students: ProvisionedStudent[] = [];

  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(3, '0');
    const email = `loadtest-${runId}-student-${pad}@loadtest.local`;
    const name = `loadtest-${runId}-Student ${pad}`;

    // Upsert student record in DB
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        role: 'STUDENT',
        active: true,
        batch: `LOADTEST-${runId}`,
      },
      update: {
        active: true,
      },
      select: { id: true, email: true, name: true },
    });

    // Ensure student assignment to the exam so access is never 404
    await prisma.examAssignment.upsert({
      where: { examId_userId: { examId, userId: user.id } },
      create: {
        examId,
        userId: user.id,
        email: user.email,
        status: 'ASSIGNED',
      },
      update: {
        revokedAt: null,
      },
    });

    // Mint genuine Auth.js session token using next-auth/jwt
    const token = await encode({
      token: {
        email: user.email,
        name: user.name ?? name,
        sub: user.id,
      },
      secret: authSecret,
      salt: cookieName,
      maxAge,
    });

    // Support both HTTP and HTTPS variants in the cookie header for proxy compatibility
    const cookieHeader = `${cookieName}=${token}; authjs.session-token=${token}; __Secure-authjs.session-token=${token}`;

    students.push({
      index: i,
      id: user.id,
      email: user.email,
      name: user.name ?? name,
      cookieHeader,
    });
  }

  console.log(
    `[Setup] Successfully provisioned ${students.length} students with minted Auth.js session cookies.`,
  );
  return students;
}
