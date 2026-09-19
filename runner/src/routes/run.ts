import { Router } from "express";

const router = Router();
type RunBody = { html?: string; css?: string; js?: string; testSpec?: string };

router.post("/", (request, response) => {
  const secret = process.env.RUNNER_SECRET;
  const authorization = request.header("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return response.status(401).json({ error: "Unauthorized" });
  const body = request.body as RunBody;
  if (!body.html || !body.css || !body.js || !body.testSpec) return response.status(400).json({ error: "Missing run input" });
  // TODO: Execute Playwright inside a sandboxed Docker container.
  // TODO: Apply a hard timeout, CPU/memory limits, and no network access.
  // TODO: Keep testSpec and expected outputs entirely server-side.
  return response.json({ passed: 0, total: 0, results: [] });
});

export default router;
