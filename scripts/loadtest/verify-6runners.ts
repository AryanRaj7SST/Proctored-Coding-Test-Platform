import { provisionStudents, resolveAuthSecret } from './session';

const RUNNER_URLS = [
  'https://proctored-runner.onrender.com',
  'https://proctored-coding-test-platform-1.onrender.com',
  'https://proctored-coding-test-platform-2.onrender.com',
  'https://proctored-coding-test-platform-3.onrender.com',
  'https://proctored-coding-test-platform-4.onrender.com',
  'https://proctored-coding-test-platform-5.onrender.com',
];

const CORRECT_CODE = `function deepGet(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length; i++) {
    if (current === null || current === undefined) return 'Not Found';
    current = current[keys[i]];
  }
  return (current === null || current === undefined) ? 'Not Found' : current;
}`;

interface RunnerMetrics {
  host: string;
  requestsDetected: number;
  peakActive: number;
  peakQueued: number;
  initialMemoryMb: number;
  finalMemoryMb: number;
}

async function main() {
  const totalRuns = 60;
  const baseUrl = 'http://127.0.0.1:3000';
  const examId = 'cmv8r19hz001gr73s1c1t60ot';

  console.log('================================================================================');
  console.log(`STEP 5: PROVING ALL 6 RUNNERS RECEIVE WORK (${totalRuns} runs spaced ~1s apart)`);
  console.log('================================================================================');

  // 1. Snapshot initial health
  console.log('\n[1/4] Sampling baseline runner health before test...');
  const initialHealth: Record<string, any> = {};
  for (const u of RUNNER_URLS) {
    const host = new URL(u).host;
    try {
      const res = await fetch(u + '/health');
      const data = await res.json();
      initialHealth[host] = data;
    } catch (e: any) {
      console.warn(`Could not reach ${host}: ${e.message}`);
    }
  }

  // 2. Provision student session
  console.log('\n[2/4] Provisioning student session for verification...');
  const [student] = await provisionStudents({
    count: 1,
    examId,
    baseUrl,
    authSecret: resolveAuthSecret(),
    runId: 'verify-6runners',
  });

  const startRes = await fetch(`${baseUrl}/api/exams/${examId}/start`, {
    method: 'POST',
    headers: { Cookie: student.cookieHeader, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const startData = await startRes.json();
  const attemptId = startData.questions?.[0]?.attempt?.id;
  if (!attemptId) {
    throw new Error(`Failed to obtain attemptId: ${JSON.stringify(startData)}`);
  }
  console.log(`Student sitting established. Attempt ID: ${attemptId}`);

  // Setup tracker
  const metrics: Record<string, RunnerMetrics> = {};
  for (const u of RUNNER_URLS) {
    const host = new URL(u).host;
    metrics[host] = {
      host,
      requestsDetected: 0,
      peakActive: 0,
      peakQueued: 0,
      initialMemoryMb: initialHealth[host]?.memoryMb?.heapUsed ?? 0,
      finalMemoryMb: 0,
    };
  }

  // 3. High-frequency background sampler (every 60ms)
  let sampling = true;
  let currentRunActiveHosts = new Set<string>();

  const samplerLoop = async () => {
    while (sampling) {
      await Promise.all(
        RUNNER_URLS.map(async (u) => {
          const host = new URL(u).host;
          try {
            const res = await fetch(u + '/health', { cache: 'no-store' });
            const data = await res.json();
            const m = metrics[host]!;
            if (data.active > m.peakActive) m.peakActive = data.active;
            if (data.queued > m.peakQueued) m.peakQueued = data.queued;
            if (data.active > 0) {
              currentRunActiveHosts.add(host);
            }
          } catch {}
        })
      );
      await new Promise((r) => setTimeout(r, 60));
    }
  };

  const samplerPromise = samplerLoop();

  // 4. Fire 60 requests through app
  console.log(`\n[3/4] Firing ${totalRuns} /run requests through app spaced ~1s apart...`);
  let successCount = 0;

  for (let i = 1; i <= totalRuns; i++) {
    currentRunActiveHosts.clear();
    const t0 = performance.now();

    const runRes = await fetch(`${baseUrl}/api/attempts/${attemptId}/run`, {
      method: 'POST',
      headers: { Cookie: student.cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: '',
        css: '',
        js: CORRECT_CODE,
      }),
    });

    const duration = Math.round(performance.now() - t0);
    const data = await runRes.json();
    const passed = data.passedCount ?? 0;
    const ok = runRes.ok && passed === 10;
    if (ok) successCount++;

    // Attribution
    const activeList = Array.from(currentRunActiveHosts);
    if (activeList.length === 1) {
      metrics[activeList[0]!]!.requestsDetected++;
    } else if (activeList.length > 1) {
      // Multiple had activity, attribute proportionally or pick first
      metrics[activeList[0]!]!.requestsDetected++;
    }

    if (i % 10 === 0 || i === totalRuns) {
      console.log(`  Progress: ${i}/${totalRuns} runs completed (${successCount} OK) | Last latency: ${duration}ms`);
    }

    // Space ~1s apart
    await new Promise((r) => setTimeout(r, 800));
  }

  // Stop sampler
  sampling = false;
  await samplerPromise;

  // Snapshot final health
  console.log('\n[4/4] Sampling final runner health after test...');
  for (const u of RUNNER_URLS) {
    const host = new URL(u).host;
    try {
      const res = await fetch(u + '/health');
      const data = await res.json();
      metrics[host]!.finalMemoryMb = data.memoryMb?.heapUsed ?? 0;
    } catch {}
  }

  // Summary & Pass Condition Evaluation
  console.log('\n================================================================================');
  console.log('STEP 5 RESULTS: RUNNER DISTRIBUTION & CAPACITY EVIDENCE');
  console.log('================================================================================');

  const rows = Object.values(metrics);
  const avgShare = totalRuns / rows.length;
  const maxAllowable = avgShare * 2.2; // ~2x average share

  let allServed = true;
  let maxShareExceeded = false;

  console.table(
    rows.map((r) => {
      const inRotation = r.requestsDetected > 0;
      if (!inRotation) allServed = false;
      if (r.requestsDetected > maxAllowable) maxShareExceeded = true;
      return {
        'Runner Host': r.host,
        'Requests Served': r.requestsDetected,
        'Peak Active': r.peakActive,
        'Peak Queued': r.peakQueued,
        'Heap Delta (MB)': r.finalMemoryMb - r.initialMemoryMb,
        Status: inRotation ? 'IN ROTATION' : 'NOT IN ROTATION',
      };
    })
  );

  console.log(`\nAverage Share per Runner: ${avgShare.toFixed(1)} requests`);
  console.log(`Successful Runs through App: ${successCount}/${totalRuns}`);
  console.log(`Every Runner Served >= 1 Run: ${allServed ? 'PASS' : 'FAIL'}`);
  console.log(`No Runner Exceeded 2x Share: ${!maxShareExceeded ? 'PASS' : 'FAIL'}`);

  return { metrics, successCount, allServed, maxShareExceeded };
}

main().catch(console.error);
