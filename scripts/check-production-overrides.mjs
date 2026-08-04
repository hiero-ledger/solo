#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Verifies that every package in package-lock.json — production and
// development alike — has a matching exact-version entry in the package.json
// overrides field, so a fresh `npm install` cannot drift from the reviewed
// lock file.
//
// Pins are major-scoped ("glob@^7.0.0": "7.2.3"), so a package used at several
// majors carries one entry per line; a package is covered when any entry for
// its name pins its exact resolved version.
//
// Exits 0 when all packages are pinned.
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

// Splits an override key into its package name and optional version selector.
// "glob@^7.0.0" -> ["glob", "^7.0.0"];  "@scope/pkg" -> ["@scope/pkg", null]
function splitOverrideKey(key) {
  const at = key.lastIndexOf('@');
  if (at <= 0) return [key, null];
  return [key.slice(0, at), key.slice(at + 1)];
}

// Every exact version pinned by the overrides, by package name. Nested entries
// ("ethers": {"ws": "8.21.0"}) pin their sub-tree just as firmly, so they count
// as coverage for the package they name.
const pinnedVersions = new Map();
function collectPins(object) {
  for (const [key, value] of Object.entries(object)) {
    const [name] = splitOverrideKey(key);
    if (typeof value !== 'string') {
      collectPins(value);
      continue;
    }
    const versions = pinnedVersions.get(name) ?? new Set();
    versions.add(value);
    pinnedVersions.set(name, versions);
  }
}
collectPins(overrides);

const missing = [];
const mismatched = [];
const seen = new Set();

for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/')) continue;
  if (info.link || !info.version) continue;

  // Aliased installs ("string-width-cjs": "npm:string-width@^4") record their
  // real package name; the override names the real package.
  const name = info.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const lockedVersion = info.version;
  if (seen.has(`${name}@${lockedVersion}`)) continue;
  seen.add(`${name}@${lockedVersion}`);

  const pinned = pinnedVersions.get(name);

  if (pinned === undefined) {
    missing.push({name, lockedVersion});
  } else if (!pinned.has(lockedVersion)) {
    mismatched.push({name, lockedVersion, pinnedVersion: [...pinned].join(', ')});
  }
}

if (missing.length === 0 && mismatched.length === 0) {
  console.log(`All ${Object.keys(overrides).length} dependency overrides are current.`);
  process.exit(0);
}

console.error('Dependency override check FAILED\n');

if (missing.length > 0) {
  console.error(`Missing overrides (${missing.length} packages not pinned):`);
  for (const {name, lockedVersion} of missing) {
    const [major, minor] = lockedVersion.split('.').map(Number);
    const range = major > 0 ? `^${major}.0.0` : `^0.${minor}.0`;
    console.error(`  ${name}@${lockedVersion}  →  add "${name}@${range}": "${lockedVersion}" to overrides`);
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
