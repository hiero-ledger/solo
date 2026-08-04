#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Regenerates the production-dependency overrides in package.json from the
// current package-lock.json.  Run this after any change to package-lock.json
// (e.g. after a Dependabot update) to keep the supply-chain pins current.
//
// Usage:  node scripts/update-production-overrides.mjs

import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// Collect every top-level production package from the lock file.
// "Top-level" means a single node_modules/<name> path with no nesting.
// "Production" means neither dev:true nor devOptional:true.
const productionOverrides = {};
for (const [key, info] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith('node_modules/')) continue;
  const segments = key.split('node_modules/');
  if (segments.length !== 2) continue; // skip nested installs
  if (info.dev || info.devOptional) continue;
  const name = segments[1];
  productionOverrides[name] = info.version;
}

// Merge: generated production pins fill the base; existing overrides take
// precedence so that hand-crafted entries (nested scopes, range selectors)
// are never silently replaced.
const merged = {
  ...Object.fromEntries(Object.entries(productionOverrides).sort(([a], [b]) => a.localeCompare(b))),
  ...pkg.overrides,
};

// Remove any override whose package was removed from the lock file entirely.
for (const key of Object.keys(pkg.overrides)) {
  if (typeof pkg.overrides[key] === 'string' && !productionOverrides[key] && !pkg.overrides[key]) {
    delete merged[key];
  }
}

const before = JSON.stringify(pkg.overrides);
pkg.overrides = merged;
const after = JSON.stringify(merged);

writeFileSync(resolve(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

if (before === after) {
  console.log('Production overrides are already up to date.');
} else {
  console.log(`Production overrides updated (${Object.keys(merged).length} entries).`);
}
