/**
 * Test-only module loader for the runner package.
 *
 * `runner/package.json` deliberately declares `"type": "commonjs"`, because
 * `tsc` compiles `runner/src` to CommonJS for the production Docker image
 * (see runner/tsconfig.json and runner/Dockerfile) — that choice is
 * independent of how the source is authored and should not change just to
 * make tests convenient.
 *
 * Node's native TypeScript support picks CommonJS-vs-ESM parsing from the
 * nearest `package.json`, which means the very same `import`/`export` syntax
 * that `tsx` and `tsc` handle fine trips the ambient detection when a plain
 * `node --test` run reaches into `runner/src` from this directory. This hook
 * simply tells Node's module loader "parse every .ts file under runner as
 * ESM", which is what the source actually is before compilation.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * `tsc` (moduleResolution: "node") lets `runner/src` import a sibling file
 * without its extension -- `from './config'` -- and adds `.ts`/`.js` itself.
 * Plain ESM resolution requires the extension explicitly. Restore the same
 * leniency here so the source does not need two different import styles for
 * "compiled by tsc" versus "run directly by node --test".
 */
export async function resolve(specifier, context, nextResolve) {
  const parentUrl = context.parentURL ?? '';
  if (specifier.startsWith('.') && !path.extname(specifier) && (parentUrl.includes('/runner/') || parentUrl.includes('\\runner\\'))) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [`${base}.ts`, `${base}.js`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const filePath = fileURLToPath(url);
    if (filePath.includes('/runner/') || filePath.includes('\\runner\\') || filePath.includes('/runner\\') || filePath.includes('\\runner/')) {
      // 'module-typescript' (not plain 'module') is what tells Node's built-in
      // translator to both treat the file as ESM AND run it through the
      // TypeScript type-stripping transform. Plain 'module' would skip stripping
      // entirely and fail on the first type annotation.
      return nextLoad(url, { ...context, format: 'module-typescript' });
    }
  }
  return nextLoad(url, context);
}
