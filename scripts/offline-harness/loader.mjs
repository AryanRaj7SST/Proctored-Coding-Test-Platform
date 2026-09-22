/**
 * Node module-resolution hook used only by `npm run verify:offline`.
 *
 * It teaches plain Node three things the bundler normally handles:
 *   `@/x`       -> <root>/src/x.ts
 *   `@shared/x` -> <root>/shared/x.ts
 *   `vitest`    -> the dependency-free shim in ./vitest-shim.mjs
 *
 * Combined with Node's built-in TypeScript type stripping this lets the pure
 * unit tests run with zero installed packages.
 */

import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shim = pathToFileURL(path.join(import.meta.dirname, 'vitest-shim.mjs')).href;

function resolveAlias(specifier) {
  let relative = null;
  if (specifier.startsWith('@shared/')) relative = path.join(root, 'shared', specifier.slice('@shared/'.length));
  else if (specifier.startsWith('@/')) relative = path.join(root, 'src', specifier.slice('@/'.length));
  if (!relative) return null;

  for (const candidate of [relative, `${relative}.ts`, `${relative}.tsx`, path.join(relative, 'index.ts')]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

/**
 * Bundlers let a relative import omit the `.ts` extension; plain Node does not.
 * Add it back so test files can use the same import style either way.
 */
function resolveExtensionless(specifier, parentURL) {
  if (!specifier.startsWith('.') || path.extname(specifier)) return null;
  if (!parentURL || !parentURL.startsWith('file:')) return null;
  const base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest') return { url: shim, shortCircuit: true };

  const aliased = resolveAlias(specifier);
  if (aliased) return { url: aliased, shortCircuit: true };

  const extended = resolveExtensionless(specifier, context.parentURL);
  if (extended) return { url: extended, shortCircuit: true };

  return nextResolve(specifier, context);
}
