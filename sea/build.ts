// Copyright (C) 2022-2024 Hedera Hashgraph, LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Builds a Node.js Single Executable Application (SEA) for the current platform.
 *
 * Pipeline:
 *   1. esbuild bundles sea/hello.ts → a single CJS file
 *   2. node --experimental-sea-config generates the SEA blob
 *   3. The node binary is copied and the blob is injected via postject
 *   4. On macOS the binary is re-signed with an ad-hoc signature
 *
 * Output: sea/dist/solo-hello-<platform>-<arch>[.exe]
 *
 * Run with:  npx tsx sea/build.ts
 */

import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEA_DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(SEA_DIR, 'dist');

const { platform, arch } = process;
const ext = platform === 'win32' ? '.exe' : '';
const binaryName = `solo-hello-${platform}-${arch}${ext}`;

const bundlePath = join(DIST_DIR, 'hello-bundle.cjs');
const blobPath = join(DIST_DIR, 'sea-prep.blob');
const configPath = join(DIST_DIR, 'sea-config.json');
const binaryPath = join(DIST_DIR, binaryName);

/** Wraps a path in double quotes for safe shell interpolation on all platforms. */
const q = (p: string): string => `"${p}"`;

function run(cmd: string, label: string): void {
  console.log(`\n▶ ${label}`);
  execSync(cmd, { stdio: 'inherit' });
}

console.log(`\nBuilding SEA binary: ${binaryName}`);

// 1. Ensure output directory exists
mkdirSync(DIST_DIR, { recursive: true });

// 2. Bundle sea/hello.ts → single CJS file via esbuild JS API (avoids shell path quoting)
console.log('\n▶ Bundling with esbuild');
await esbuild.build({
  entryPoints: [join(SEA_DIR, 'hello.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: bundlePath,
});

// 3. Write sea-config.json with absolute paths so it resolves correctly regardless of cwd
writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    },
    null,
    2,
  ),
);

// 4. Generate SEA blob
run(`node --experimental-sea-config ${q(configPath)}`, 'Generating SEA blob');

// 5. Copy current node binary as the base executable
copyFileSync(process.execPath, binaryPath);
console.log(`\n▶ Copied node binary → ${binaryName}`);

// 6. macOS requires stripping the existing signature before injection
if (platform === 'darwin') {
  run(`codesign --remove-signature ${q(binaryPath)}`, 'Removing existing macOS signature');
}

// 7. Inject the blob into the binary using postject
const machoFlag = platform === 'darwin' ? '--macho-segment-name NODE_SEA' : '';
run(
  `npx postject ${q(binaryPath)} NODE_SEA_BLOB ${q(blobPath)} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${machoFlag}`,
  'Injecting SEA blob via postject',
);

// 8. macOS: apply ad-hoc signature so Gatekeeper accepts the modified binary
if (platform === 'darwin') {
  run(`codesign --sign - ${q(binaryPath)}`, 'Re-signing for macOS (ad-hoc)');
}

console.log(`\n✓ SEA binary ready: sea/dist/${binaryName}\n`);
