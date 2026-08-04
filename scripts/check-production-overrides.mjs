#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Verifies that every top-level production dependency in package-lock.json
// has a matching exact-version entry in the package.json overrides field.
//
// Exits 0 when all production packages are pinned.
// Exits 1 and prints a report when any are missing or version-mismatched.
//
// Usage:  node scripts/check-production-overrides.mjs

import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const overrides = pkg.overrides ?? {};

const missing = [];
const mismatched = [];

for (const [key, info] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith('node_modules/')) continue;
  const segments = key.split('node_modules/');
  if (segments.length !== 2) continue; // skip nested installs
  if (info.dev || info.devOptional) continue;

  const name = segments[1];
  const lockedVersion = info.version;
  const override = overrides[name];

  if (override === undefined) {
    missing.push({name, lockedVersion});
  } else if (typeof override === 'string' && override !== lockedVersion) {
    mismatched.push({name, lockedVersion, pinnedVersion: override});
  }
  // typeof override === 'object' means it's a nested/scoped override — skip,
  // those are intentional hand-crafted entries covering specific sub-trees.
}

if (missing.length === 0 && mismatched.length === 0) {
  console.log(`All ${Object.keys(overrides).length} production overrides are current.`);
  process.exit(0);
}

console.error('Production dependency override check FAILED\n');

if (missing.length > 0) {
  console.error(`Missing overrides (${missing.length} packages not pinned):`);
  for (const {name, lockedVersion} of missing) {
    console.error(`  ${name}@${lockedVersion}  →  add "${name}": "${lockedVersion}" to overrides`);
  }
  console.error('');
}

if (mismatched.length > 0) {
  console.error(`Version mismatches (override differs from lock file):`);
  for (const {name, lockedVersion, pinnedVersion} of mismatched) {
    console.error(`  ${name}: override="${pinnedVersion}"  lock="${lockedVersion}"`);
  }
  console.error('');
}

console.error('Run  node scripts/update-production-overrides.mjs  to fix.');
process.exit(1);
