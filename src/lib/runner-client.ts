type RunnerRequest = { html: string; css: string; js: string; testSpec: string };
type RunnerResponse = { passed: number; total: number; results: Array<{ testName: string; passed: boolean; message?: string }> };

export async function runInRunner(input: RunnerRequest): Promise<RunnerResponse> {
  const runnerUrl = process.env.RUNNER_URL;
  const runnerSecret = process.env.RUNNER_SECRET;
  if (!runnerUrl || !runnerSecret) throw new Error("Runner configuration is missing");

  const response = await fetch(`${runnerUrl}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${runnerSecret}` },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(`Runner returned ${response.status}`);
  return (await response.json()) as RunnerResponse;
}
