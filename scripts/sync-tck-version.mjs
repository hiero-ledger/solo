// SPDX-License-Identifier: Apache-2.0

import {closeSync, existsSync, ftruncateSync, openSync, readFileSync, writeSync} from 'node:fs';

// npm's version lifecycle runs after updating the root manifest, including before npm ci in build workflows.
class SyncTckVersion {
  static writeJson(fileDescriptor, value) {
    const contents = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    let position = 0;
    while (position < contents.length) {
      position += writeSync(fileDescriptor, contents, position, contents.length - position, position);
    }
    ftruncateSync(fileDescriptor, contents.length);
  }

  static run() {
    const kitDirectory = new URL('../tck/', import.meta.url);
    if (!existsSync(kitDirectory)) return;

    const rootManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const manifestPath = new URL('package.json', kitDirectory);
    const lockPath = new URL('package-lock.json', kitDirectory);
    const manifestDescriptor = openSync(manifestPath, 'r+');
    let lockDescriptor;
    try {
      const manifest = JSON.parse(readFileSync(manifestDescriptor, 'utf8'));
      try {
        lockDescriptor = openSync(lockPath, 'r+');
      } catch (error) {
        // The lockfile is optional before dependencies are installed; other failures must remain visible.
        if (error.code !== 'ENOENT') throw error;
      }
      const lock = lockDescriptor === undefined ? undefined : JSON.parse(readFileSync(lockDescriptor, 'utf8'));

      manifest.version = rootManifest.version;
      if (lock) {
        lock.version = rootManifest.version;
        if (lock.packages?.['']) lock.packages[''].version = rootManifest.version;
      }

      SyncTckVersion.writeJson(manifestDescriptor, manifest);
      if (lock) SyncTckVersion.writeJson(lockDescriptor, lock);
    } finally {
      try {
        if (lockDescriptor !== undefined) closeSync(lockDescriptor);
      } finally {
        closeSync(manifestDescriptor);
      }
    }
  }
}

SyncTckVersion.run();
