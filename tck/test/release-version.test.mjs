// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('the kit manifest and lockfile share the Solo release version', () => {
  const rootManifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const kitManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const kitLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

  assert.deepEqual(
    {manifest: kitManifest.version, lock: kitLock.version, lockPackage: kitLock.packages[''].version},
    {manifest: rootManifest.version, lock: rootManifest.version, lockPackage: rootManifest.version},
  );
});
