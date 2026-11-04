// SPDX-License-Identifier: Apache-2.0

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

// npm's version lifecycle runs after updating the root manifest, including before npm ci in build workflows.
class SyncTckVersion {
  static run() {
    const kitDirectory = new URL('../tck/', import.meta.url);
    if (!existsSync(kitDirectory)) return;

    const rootManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const manifestPath = new URL('package.json', kitDirectory);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const lockPath = new URL('package-lock.json', kitDirectory);
    const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : undefined;

    manifest.version = rootManifest.version;
    if (lock) {
      lock.version = rootManifest.version;
      if (lock.packages?.['']) lock.packages[''].version = rootManifest.version;
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (lock) writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
}

SyncTckVersion.run();
