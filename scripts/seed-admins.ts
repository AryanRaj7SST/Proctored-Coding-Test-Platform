/* eslint-disable no-console */
/**
 * Grant ADMIN to the platform's administrators -- the one supported way to
 * bootstrap or add administrators outside the admin UI.
 *
 *   npm run db:seed-admins -- --dry-run            # show what would change
 *   npm run db:seed-admins -- --yes                # apply (required for a non-local database)
 *   npm run db:seed-admins -- --yes a@x.com b@y.com   # a different list
 *   ADMIN_EMAILS="a@x.com,b@y.com" npm run db:seed-admins -- --yes
 *
 * For each address:
 *   - no account yet  -> an ADMIN account is created; the first Google sign-in keeps
 *                        ADMIN (sign-in never changes an existing role);
 *   - a STUDENT       -> promoted to ADMIN (and reactivated if it was deactivated);
 *   - already ADMIN   -> left as it is.
 * It never demotes anyone, and every change is written to the audit log.
 * Roles come only from this script and the administrator-only Students page.
 */
import { prisma } from '../src/lib/prisma';
import { isValidEmail, normalizeEmail } from '../src/lib/email';
import { recordAudit } from '../src/server/services/audit';

const DEFAULT_ADMINS = [
  'kartikgupta1712@gmail.com',
  'kartik.25bcs10035@sst.scaler.com',
  'aryan.25bcs10317@sst.scaler.com',
  'agnihotriaryan5361@gmail.com',
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function targetHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirmed = args.includes('--yes');
  const listed = args.filter((a) => !a.startsWith('--'));
  const fromEnv = (process.env.ADMIN_EMAILS ?? '').split(',').filter((e) => e.trim());
  const emails = [
    ...new Set((listed.length ? listed : fromEnv.length ? fromEnv : DEFAULT_ADMINS).map(normalizeEmail)),
  ];

  const invalid = emails.filter((e) => !isValidEmail(e));
  if (invalid.length) throw new Error(`Not valid email addresses: ${invalid.join(', ')}`);

  const host = targetHost();
  if (!host) throw new Error('DATABASE_URL is missing or not a valid URL.');
  if (!LOCAL_HOSTS.has(host) && !dryRun && !confirmed) {
    throw new Error(
      `This would grant ADMIN on the database at "${host}". Check the list with --dry-run, then re-run with --yes.`,
    );
  }
  console.log(`${dryRun ? '[dry run] ' : ''}Target database host: ${host}`);

  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, active: true },
    });
    if (user?.role === 'ADMIN' && user.active) {
      console.log(`  unchanged  ${email} (already ADMIN)`);
      continue;
    }
    if (dryRun) {
      console.log(
        `  would ${user ? `promote ${email} (${user.role}${user.active ? '' : ', deactivated'} -> ADMIN)` : `create ${email} as ADMIN`}`,
      );
      continue;
    }
    if (!user) {
      const created = await prisma.user.create({ data: { email, role: 'ADMIN', active: true } });
      await recordAudit({
        action: 'user.admin_seeded',
        entity: 'User',
        entityId: created.id,
        metadata: { email, via: 'scripts/seed-admins.ts' },
      });
      console.log(`  created    ${email} as ADMIN (keeps ADMIN at first Google sign-in)`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', active: true } });
    await recordAudit({
      action: 'user.role_changed',
      entity: 'User',
      entityId: user.id,
      metadata: {
        email,
        role: { from: user.role, to: 'ADMIN' },
        ...(user.active ? {} : { reactivated: true }),
        via: 'scripts/seed-admins.ts',
      },
    });
    console.log(`  promoted   ${email} (${user.role} -> ADMIN${user.active ? '' : ', reactivated'})`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
