// SPDX-License-Identifier: Apache-2.0

// npm's `version` lifecycle hook: give the kit's manifest and lockfile Solo's new version.
import {readFileSync, writeFileSync} from 'node:fs';

const {version} = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of ['tck/package.json', 'tck/package-lock.json']) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue; // no kit, or no lockfile yet
    throw error;
  }
  json.version = version;
  if (json.packages?.['']) json.packages[''].version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
