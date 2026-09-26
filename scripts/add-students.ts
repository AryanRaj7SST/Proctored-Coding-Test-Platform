/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STUDENT_EMAILS = [
  'aadit.26bcs10075@sst.scaler.com',
  'aaditya.26bcs10564@sst.scaler.com',
  'aayush.26bcs10035@sst.scaler.com',
  'aditya.26bcs10357@sst.scaler.com',
  'ahaan.26bcs10321@sst.scaler.com',
  'akshat.26bcs10019@sst.scaler.com',
  'ansh.26bcs10374@sst.scaler.com',
  'archit.26bcs10083@sst.scaler.com',
  'ashutosh.26bcs10421@sst.scaler.com',
  'bhargava.26bcs10003@sst.scaler.com',
  'jaipal.26bcs10307@sst.scaler.com',
  'jyothi.26bcs10382@sst.scaler.com',
  'kanak.26bcs10225@sst.scaler.com',
  'keshav.26bcs10336@sst.scaler.com',
  'kunal.26bcs10020@sst.scaler.com',
  'm.vignan.26bcs10567@sst.scaler.com',
  'shahid.26bcs10134@sst.scaler.com',
  'megh.26bcs10547@sst.scaler.com',
  'mudit.26bcs10340@sst.scaler.com',
  'prisha.26bcs10419@sst.scaler.com',
  'pulkit.26bcs10118@sst.scaler.com',
  'raj.26bcs10466@sst.scaler.com',
  'ramanujam.26bcs10563@sst.scaler.com',
  'rishabh.26bcs10506@sst.scaler.com',
  'rishit.26bcs10505@sst.scaler.com',
  'shahzeb.26bcs10301@sst.scaler.com',
  'sharva.26bcs10391@sst.scaler.com',
  'shreyansh.26bcs10045@sst.scaler.com',
  'sneha.26bcs10202@sst.scaler.com',
  'sourav.26bcs10085@sst.scaler.com',
  'sri.26bcs10492@sst.scaler.com',
  'sujay.26bcs10095@sst.scaler.com',
  'swati.26bcs10163@sst.scaler.com',
  'ushabh.26bcs10344@sst.scaler.com',
  'varshith.26bcs10108@sst.scaler.com',
  'vipin.26bcs10552@sst.scaler.com',
  'suraj.26bcs10772@sst.scaler.com',
];

const BATCH = '2029';

function formatNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split('.');
  // Exclude parts that look like roll numbers (e.g. 26bcs10075)
  const nameParts = parts.filter((p) => !/^\d|^[a-z]{0,2}\d/i.test(p) && !/^\d+bcs/i.test(p));
  if (nameParts.length === 0) {
    return local;
  }
  return nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

async function main(): Promise<void> {
  console.log(`Adding ${STUDENT_EMAILS.length} students to batch ${BATCH}...`);

  // Find exams that have assignments so we can also assign these new students
  const exams = await prisma.exam.findMany({
    where: { batch: BATCH },
    select: { id: true, title: true, accessMode: true },
  });
  console.log(`Found ${exams.length} exams matching batch ${BATCH}: ${exams.map((e) => e.title).join(', ')}`);

  let rosterUpserted = 0;
  let userUpserted = 0;
  let assignmentsCreated = 0;

  for (const rawEmail of STUDENT_EMAILS) {
    const email = rawEmail.trim().toLowerCase();
    const displayName = formatNameFromEmail(email);

    // 1. Roster (AllowedEmail)
    await prisma.allowedEmail.upsert({
      where: { email },
      create: {
        email,
        batch: BATCH,
        note: 'Student',
      },
      update: {
        batch: BATCH,
      },
    });
    rosterUpserted += 1;

    // 2. User account
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: displayName,
        role: 'STUDENT',
        batch: BATCH,
        active: true,
      },
      update: {
        role: 'STUDENT',
        batch: BATCH,
        active: true,
      },
    });
    userUpserted += 1;

    // 3. Exam assignments for batch exams (like Lab Quiz 1)
    for (const exam of exams) {
      const assignment = await prisma.examAssignment.upsert({
        where: {
          examId_email: {
            examId: exam.id,
            email,
          },
        },
        create: {
          examId: exam.id,
          email,
          userId: user.id,
          status: 'ASSIGNED',
        },
        update: {
          userId: user.id,
        },
      });
      if (assignment) assignmentsCreated += 1;
    }
  }

  console.log(`Done! Summary:`);
  console.log(`- AllowedEmail roster entries: ${rosterUpserted}`);
  console.log(`- User accounts: ${userUpserted}`);
  console.log(`- Exam assignments checked/created: ${assignmentsCreated}`);
}

main()
  .catch((err) => {
    console.error('Failed to add students:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
