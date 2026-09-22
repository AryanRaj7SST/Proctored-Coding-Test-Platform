# Runner tests

`npm test` (from `runner/`) runs these with Node's built-in test runner and
its native TypeScript support — no dependency install required, same as the
app's `npm run verify:offline`.

## Why there's a loader here

`runner/package.json` declares `"type": "commonjs"` because `tsc` compiles
`runner/src` to CommonJS for the production Docker image (see
`runner/Dockerfile`). That's the right choice for the compiled output, but it
means Node's *ambient* CommonJS-vs-ESM detection — based on the nearest
`package.json` — treats the TypeScript *source* files the same way, and plain
`import`/`export` syntax in a CommonJS-typed `.ts` file doesn't parse.

`tests/register.mjs` + `tests/esm-loader.mjs` fix exactly this, using Node's
module customization hooks to:

1. force `runner/src/**/*.ts` to be parsed as ESM with TypeScript stripping
   (`format: 'module-typescript'`), regardless of the ambient `"type"` field;
2. resolve the extensionless relative imports (`from './config'`) that `tsc`'s
   `moduleResolution: "node"` allows but native ESM resolution does not.

This changes nothing about how the app is built or deployed — `tsx` (dev) and
`tsc` (production) already handle this source correctly. It only makes `node
--test` able to import the same files directly, without installing anything.

## Scope

- `queue.test.ts` — the bounded-concurrency queue (no Redis, product
  requirement #33): concurrency really is capped, excess work queues rather
  than drops, and a full queue rejects with `QUEUE_FULL`.
- `auth.test.ts` — the app↔runner HMAC handshake: valid requests pass, a wrong
  token/signature/stale timestamp/tampered body are all rejected with the
  right reason code.
- `page-script.test.ts` — structural checks on the in-page evaluator (every
  DSL assertion type has a matching branch, no stray branch for a type the
  schema doesn't define, no source-text reads). The evaluator's actual DOM
  behaviour (`getComputedStyle`, grid geometry, colour resolution) only runs
  inside a real browser tab and is covered by the runner container itself —
  see `npm run validate:stack` at the repo root and `tests/e2e/`.
