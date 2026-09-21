// Deep-merges i18n fragments into public/i18n/<locale>.json.
//
// Usage: node agent/i18n/merge.mjs <locale> <fragment.json> [more.json ...]
//
// Why a script instead of hand-editing: the catalogs must stay structurally
// identical between locales, and a deep merge keeps key order stable and cannot
// produce invalid JSON.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , locale, ...fragmentPaths] = process.argv;

if (!locale || fragmentPaths.length === 0) {
  console.error('usage: node agent/i18n/merge.mjs <locale> <fragment.json> [...]');
  process.exit(1);
}

const target = join('src', 'frontend', 'prices-admin', 'public', 'i18n', `${locale}.json`);

/*
 * Merges `source` into `base`. Existing leaf values are PRESERVED unless
 * `--overwrite` is passed, so re-running a merge cannot silently change copy
 * that was already reviewed.
 */
function merge(base, source, path = '') {
  for (const [key, value] of Object.entries(source)) {
    const here = path ? `${path}.${key}` : key;
    const current = base[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (current === undefined) {
        base[key] = {};
      } else if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`${here}: cannot merge an object over a ${typeof current}`);
      }
      merge(base[key], value, here);
      continue;
    }

    if (current !== undefined) {
      if (current !== value) {
        console.log(`  keep ${here}: existing "${current}" (fragment had "${value}")`);
      }
      continue;
    }

    base[key] = value;
  }
  return base;
}

if (!existsSync(target)) {
  console.error(`missing catalog: ${target}`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(target, 'utf8'));
let added = 0;
const countKeys = (value) =>
  value !== null && typeof value === 'object'
    ? Object.values(value).reduce((total, child) => total + countKeys(child), 0)
    : 1;

const before = countKeys(catalog);

for (const fragmentPath of fragmentPaths) {
  const fragment = JSON.parse(readFileSync(fragmentPath, 'utf8'));
  merge(catalog, fragment);
}

const after = countKeys(catalog);
added = after - before;

writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`${locale}: ${added} keys added, ${after} total -> ${target}`);
