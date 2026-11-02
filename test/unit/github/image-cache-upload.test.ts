// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {OperatingSystem} from '../../../src/business/utils/operating-system.js';

const itOnPosix: Mocha.TestFunction | Mocha.PendingTestFunction = OperatingSystem.isWin32() ? it.skip : it;

const uploadScript: string = PathEx.resolve('.github/workflows/script/image_cache_upload.sh');
const bucketName: string = 'test-bucket';

// Stands in for `gcloud storage`, backed by the directory in FAKE_BUCKET_DIRECTORY: it answers the two calls the
// upload script makes, `objects describe` (the object's base64 MD5, or a 404) and a conditional `cp`.
const fakeGcloud: string = `#!/usr/bin/env bash
set -euo pipefail
object_path() { echo "\${FAKE_BUCKET_DIRECTORY}/\${1#gs://${bucketName}/}"; }
if [[ "$1 $2 $3" == 'storage objects describe' ]]; then
  path="$(object_path "$4")"
  if [[ ! -f "\${path}" ]]; then
    echo "ERROR: (gcloud.storage.objects.describe) $4 not found: 404." >&2
    exit 1
  fi
  openssl dgst -md5 -binary "\${path}" | base64
elif [[ "$1 $2" == 'storage cp' ]]; then
  [[ "$3" == '--if-generation-match=0' ]] || { echo "unconditional upload: $*" >&2; exit 2; }
  path="$(object_path "$6")"
  if [[ -e "\${path}" ]]; then
    echo "ERROR: $6 already exists: 412 Precondition Failed" >&2
    exit 1
  fi
  cp "$5" "\${path}"
else
  echo "unexpected gcloud call: $*" >&2
  exit 2
fi
`;

describe('image_cache_upload.sh', (): void => {
  let directory: string;
  let cacheDirectory: string;
  let bucketDirectory: string;
  let binDirectory: string;

  const exportArchive: (name: string, content: string) => void = (name: string, content: string): void => {
    fs.writeFileSync(PathEx.join(cacheDirectory, `${name}.tar`), content);
    fs.writeFileSync(PathEx.join(cacheDirectory, `${name}.tar.sha256`), `hash of ${content}\n`);
  };

  const writeIndex: (names: string[]) => void = (names: string[]): void => {
    const entries: object[] = names.map((name: string): object => ({
      tarFile: `${name}.tar`,
      hashFile: `${name}.tar.sha256`,
    }));
    fs.writeFileSync(PathEx.join(cacheDirectory, 'image-cache-images.json'), JSON.stringify(entries));
  };

  const runUpload: () => SpawnSyncReturns<string> = (): SpawnSyncReturns<string> =>
    spawnSync('bash', [uploadScript, cacheDirectory, bucketName], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDirectory}${PathEx.delimiter}${process.env.PATH}`,
        FAKE_BUCKET_DIRECTORY: bucketDirectory,
      },
    });

  const published: () => string[] = (): string[] => fs.readdirSync(bucketDirectory).toSorted();

  beforeEach((): void => {
    directory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-image-cache-upload-'));
    cacheDirectory = PathEx.join(directory, 'image-cache');
    bucketDirectory = PathEx.join(directory, 'bucket');
    binDirectory = PathEx.join(directory, 'bin');
    for (const created of [cacheDirectory, bucketDirectory, binDirectory]) {
      fs.mkdirSync(created);
    }
    fs.writeFileSync(PathEx.join(binDirectory, 'gcloud'), fakeGcloud, {mode: 0o755});
  });

  afterEach((): void => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  itOnPosix('uploads every archive with its hash file, then skips them when they are already published', (): void => {
    exportArchive('first', 'first archive');
    exportArchive('second', 'second archive');
    writeIndex(['first', 'second']);

    const firstRun: SpawnSyncReturns<string> = runUpload();
    expect(firstRun.status, firstRun.stderr).to.equal(0);
    expect(published()).to.deep.equal(['first.tar', 'first.tar.sha256', 'second.tar', 'second.tar.sha256']);

    const secondRun: SpawnSyncReturns<string> = runUpload();
    expect(secondRun.status, secondRun.stderr).to.equal(0);
    expect(secondRun.stdout).to.include('0 uploaded, 4 already published, 0 conflicting');
  });

  itOnPosix('withholds the hash file of an archive left on the CDN by an interrupted upload', (): void => {
    // An earlier run uploaded a different first.tar and was interrupted before its hash file.
    fs.writeFileSync(PathEx.join(bucketDirectory, 'first.tar'), 'older first archive');
    exportArchive('first', 'first archive');
    exportArchive('second', 'second archive');
    writeIndex(['first', 'second']);

    const result: SpawnSyncReturns<string> = runUpload();

    expect(result.status).to.equal(1);
    expect(result.stderr).to.include(`gs://${bucketName}/first.tar already exists with different content`);
    expect(result.stderr).to.include('not publishing first.tar.sha256');
    // The conflicting archive is left as it was and gets no hash file; the other archive is still published.
    expect(published()).to.deep.equal(['first.tar', 'second.tar', 'second.tar.sha256']);
    expect(fs.readFileSync(PathEx.join(bucketDirectory, 'first.tar'), 'utf8')).to.equal('older first archive');
    expect(result.stdout).to.include('2 uploaded, 0 already published, 1 conflicting, 1 hash file(s) withheld');
  });
});
