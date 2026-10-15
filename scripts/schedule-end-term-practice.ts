/* eslint-disable no-console */
import { prisma } from '../src/lib/prisma';

const STUDENT_EMAILS = [
  'ankit.26bcs10185@sst.scaler.com',
  'anukriti.26bcs10354@sst.scaler.com',
  'arpita.26bcs10369@sst.scaler.com',
  'aryan.26bcs10373@sst.scaler.com',
  'avyukt.26bcs10513@sst.scaler.com',
  'daksh.26bcs10150@sst.scaler.com',
  'dharm.26bcs10249@sst.scaler.com',
  'dhruv.26bcs10426@sst.scaler.com',
  'dhruv.26bcs10145@sst.scaler.com',
  'harshil.26bcs10314@sst.scaler.com',
  'jay.26bcs10299@sst.scaler.com',
  'kapish.26bcs10397@sst.scaler.com',
  'kushagra.26bcs10206@sst.scaler.com',
  'lucky.26bcs10561@sst.scaler.com',
  'rishith.26bcs10358@sst.scaler.com',
  'maneesh.26bcs10027@sst.scaler.com',
  'suleiman.26bcs10057@sst.scaler.com',
  'misri.26bcs10488@sst.scaler.com',
  'mohammed.26bcs10363@sst.scaler.com',
  'naman.26bcs10305@sst.scaler.com',
  'naman.26bcs10511@sst.scaler.com',
  'prakash.26bcs10329@sst.scaler.com',
  'samarth.26bcs10072@sst.scaler.com',
  'sambhav.26bcs10416@sst.scaler.com',
  'shaurya.26bcs10312@sst.scaler.com',
  'shaurya.26bcs10320@sst.scaler.com',
  'shubham.26bcs10576@sst.scaler.com',
  'smit.26bcs10376@sst.scaler.com',
  'sparsh.26bcs10528@sst.scaler.com',
  'tejas.26bcs10350@sst.scaler.com',
  'thumu.26bcs10359@sst.scaler.com',
  'uday.26bcs10332@sst.scaler.com',
  'utsav.26bcs10380@sst.scaler.com',
  'yagyanshi.26bcs10069@sst.scaler.com',
  'puchakayala.26bcs10763@sst.scaler.com',
  'aksh.26bcs10284@sst.scaler.com',
  'akshata.26bcs10490@sst.scaler.com',
  'amrith.26bcs10017@sst.scaler.com',
  'arnak.26bcs10240@sst.scaler.com',
  'arnav.26bcs10203@sst.scaler.com',
  'aryan.26bcs10187@sst.scaler.com',
  'ashwik.26bcs10379@sst.scaler.com',
  'ashwith.26bcs10405@sst.scaler.com',
  'avani.26bcs10330@sst.scaler.com',
  'bishesh.26bcs10123@sst.scaler.com',
  'digvijay.26bcs10214@sst.scaler.com',
  'diya.26bcs10090@sst.scaler.com',
  'gopal.26bcs10389@sst.scaler.com',
  'arihanth.26bcs10107@sst.scaler.com',
  'ishan.26bcs10298@sst.scaler.com',
  'jenish.26bcs10111@sst.scaler.com',
  'kevin.26bcs10022@sst.scaler.com',
  'kripa.26bcs10236@sst.scaler.com',
  'mahesh.26bcs10179@sst.scaler.com',
  'manish.26bcs10031@sst.scaler.com',
  'mihir.26bcs10064@sst.scaler.com',
  'mohammad.26bcs10527@sst.scaler.com',
  'mohammed.26bcs10302@sst.scaler.com',
  'nikshith.26bcs10348@sst.scaler.com',
  'nikunj.26bcs10352@sst.scaler.com',
  'pari.26bcs10281@sst.scaler.com',
  'reethish.26bcs10360@sst.scaler.com',
  'reyansh.26bcs10596@sst.scaler.com',
  'rishin.26bcs10058@sst.scaler.com',
  'riya.26bcs10337@sst.scaler.com',
  'sanjiv.26bcs10406@sst.scaler.com',
  'shiva.26bcs10309@sst.scaler.com',
  'shubham.26bcs10074@sst.scaler.com',
  'siddhanth.26bcs10300@sst.scaler.com',
  'sree.26bcs10351@sst.scaler.com',
  'vyshnav.26bcs10402@sst.scaler.com',
  'aaryan.26bcs10493@sst.scaler.com',
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
  'aashman.26bcs10740@sst.scaler.com',
  'abhinav.26bcs10262@sst.scaler.com',
  'aditya.26bcs10032@sst.scaler.com',
  'arghadeep.26bcs10167@sst.scaler.com',
  'ariya.26bcs10112@sst.scaler.com',
  'arpit.26bcs10322@sst.scaler.com',
  'asheeth.26bcs10343@sst.scaler.com',
  'darsh.26bcs10208@sst.scaler.com',
  'dev.26bcs10481@sst.scaler.com',
  'dhruv.26bcs10137@sst.scaler.com',
  'gundlapalli.26bcs10039@sst.scaler.com',
  'harshwardhan.26bcs10138@sst.scaler.com',
  'hasibmohammad.26bcs10070@sst.scaler.com',
  'ipshita.26bcs10510@sst.scaler.com',
  'ishit.26bcs10324@sst.scaler.com',
  'iyham.26bcs10315@sst.scaler.com',
  'jai.26bcs10367@sst.scaler.com',
  'lavanya.26bcs10143@sst.scaler.com',
  'marvik.26bcs10067@sst.scaler.com',
  'mohammad.26bcs10194@sst.scaler.com',
  'naga.26bcs10147@sst.scaler.com',
  'pranav.26bcs10431@sst.scaler.com',
  'pratishtha.26bcs10247@sst.scaler.com',
  'prerit.26bcs10570@sst.scaler.com',
  'priyansh.26bcs10304@sst.scaler.com',
  'ragul.26bcs10574@sst.scaler.com',
  'rahul.26bcs10686@sst.scaler.com',
  'ritwanjay.26bcs10395@sst.scaler.com',
  'rohan.26bcs10334@sst.scaler.com',
  'shaik.26bcs10385@sst.scaler.com',
  'shivendra.26bcs10366@sst.scaler.com',
  'shreyansh.26bcs10260@sst.scaler.com',
  'siya.26bcs10362@sst.scaler.com',
  'vankadara.26bcs10106@sst.scaler.com',
  'veerendra.26bcs10082@sst.scaler.com',
  'vineet.26bcs10422@sst.scaler.com',
  'aayush.26bcs10014@sst.scaler.com',
  'aditya.26bcs10182@sst.scaler.com',
  'aditya.26bcs10297@sst.scaler.com',
  'ananta.26bcs10328@sst.scaler.com',
  'aninda.26bcs10372@sst.scaler.com',
  'archit.26bcs10012@sst.scaler.com',
  'arin.26bcs10124@sst.scaler.com',
  'arpit.26bcs10023@sst.scaler.com',
  'ayaan.26bcs10356@sst.scaler.com',
  'chirayu.26bcs10390@sst.scaler.com',
  'dandu.26bcs10349@sst.scaler.com',
  'ishaan.26bcs10233@sst.scaler.com',
  'mayank.26bcs10316@sst.scaler.com',
  'tauqeer.26bcs10159@sst.scaler.com',
  'mohammed.26bcs10486@sst.scaler.com',
  'mukesh.26bcs10215@sst.scaler.com',
  'nadimpalli.26bcs10361@sst.scaler.com',
  'narendra.26bcs10595@sst.scaler.com',
  'nihar.26bcs10098@sst.scaler.com',
  'nishant.26bcs10276@sst.scaler.com',
  'nishant.26bcs10136@sst.scaler.com',
  'pearl.26bcs10164@sst.scaler.com',
  'pulkit.26bcs10149@sst.scaler.com',
  'puranjay.26bcs10001@sst.scaler.com',
  'raktimjyoti.26bcs10303@sst.scaler.com',
  'rithvik.26bcs10231@sst.scaler.com',
  'rudra.26bcs10338@sst.scaler.com',
  'sanjay.26bcs10355@sst.scaler.com',
  'sayali.26bcs10558@sst.scaler.com',
  'shikhar.26bcs10342@sst.scaler.com',
  'shreyans.26bcs10371@sst.scaler.com',
  'sourav.26bcs10198@sst.scaler.com',
  'varun.26bcs10091@sst.scaler.com',
  'vishitha.26bcs10028@sst.scaler.com',
  'vritant.26bcs10222@sst.scaler.com',
  'vyom.26bcs10073@sst.scaler.com',
];

const BATCH = '2029';

function formatNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split('.');
  const nameParts = parts.filter((p) => !/^\d|^[a-z]{0,2}\d/i.test(p) && !/^\d+bcs/i.test(p));
  if (nameParts.length === 0) {
    return local;
  }
  return nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

async function main() {
  console.log('=== Scheduling End-term Practice Test ===');

  // 1. Clean & deduplicate email list
  const uniqueEmails = Array.from(new Set(STUDENT_EMAILS.map((e) => e.trim().toLowerCase())));
  console.log(`Total input emails: ${STUDENT_EMAILS.length}, Unique: ${uniqueEmails.length}`);

  // 2. Find the Exam
  let exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: 'cmv8qabgl0000r7fsse5n1fgw' },
        { title: { contains: 'end-term practice', mode: 'insensitive' } },
        { title: { contains: 'end term practice', mode: 'insensitive' } },
      ],
    },
  });

  if (!exam) {
    throw new Error('Could not find "End-term practice test" exam!');
  }

  console.log(`Found exam: "${exam.title}" (ID: ${exam.id})`);

  // 3. Today's date: 2026-10-15
  // 2:45 PM to 4:45 PM IST (Asia/Kolkata is UTC+5:30)
  // 14:45 IST = 09:15:00.000Z
  // 16:45 IST = 11:15:00.000Z
  const startTime = new Date('2026-10-15T09:15:00.000Z');
  const endTime = new Date('2026-10-15T11:15:00.000Z');
  const durationMinutes = 120;

  exam = await prisma.exam.update({
    where: { id: exam.id },
    data: {
      active: true,
      status: 'PUBLISHED',
      startTime,
      endTime,
      durationMinutes,
      timezone: 'Asia/Kolkata',
    },
  });

  console.log('Updated exam timing:');
  console.log(`  Start Time: ${exam.startTime?.toISOString()} (2:45 PM IST)`);
  console.log(`  End Time:   ${exam.endTime?.toISOString()} (4:45 PM IST)`);
  console.log(`  Duration:   ${exam.durationMinutes} minutes`);
  console.log(`  Status:     ${exam.status}, Active: ${exam.active}`);

  // 4. Upsert Roster (AllowedEmail) and User accounts for all students
  console.log('\nUpserting students in AllowedEmail and User tables...');
  let usersCreatedOrFound = 0;
  const userMap = new Map<string, string>(); // email -> userId

  for (const email of uniqueEmails) {
    const name = formatNameFromEmail(email);

    // Roster entry
    await prisma.allowedEmail.upsert({
      where: { email },
      create: {
        email,
        batch: BATCH,
        note: 'End-term practice test student',
      },
      update: {
        batch: BATCH,
      },
    });

    // User record
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        role: 'STUDENT',
        batch: BATCH,
        active: true,
      },
      update: {
        active: true,
        role: 'STUDENT',
      },
    });

    userMap.set(email, user.id);
    usersCreatedOrFound++;
  }
  console.log(`Processed ${usersCreatedOrFound} student accounts.`);

  // 5. Create or restore ExamAssignment for every student
  console.log(`\nAssigning ${uniqueEmails.length} students to exam "${exam.title}"...`);
  let assignedCount = 0;
  for (const email of uniqueEmails) {
    const userId = userMap.get(email) ?? null;
    await prisma.examAssignment.upsert({
      where: {
        examId_email: {
          examId: exam.id,
          email,
        },
      },
      create: {
        examId: exam.id,
        email,
        userId,
        status: 'ASSIGNED',
        revokedAt: null,
      },
      update: {
        userId,
        revokedAt: null,
      },
    });
    assignedCount++;
  }

  console.log(`Successfully assigned ${assignedCount} students to exam.`);

  // 6. Verification
  const totalAssignments = await prisma.examAssignment.count({
    where: { examId: exam.id, revokedAt: null },
  });
  console.log(`\n=== Verification ===`);
  console.log(`Exam: ${exam.title} (${exam.id})`);
  console.log(`Total active assignments: ${totalAssignments}`);
  console.log(`Scheduled: Today (2026-10-15) 2:45 PM IST to 4:45 PM IST`);
}

main()
  .catch((err) => {
    console.error('Error running schedule script:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
