// SPDX-License-Identifier: Apache-2.0

import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const soloNoCache = process.env.SOLO_NO_CACHE?.toLowerCase() === 'true';

// npm runs postinstall for both local development installs and global package installs.
// Only populate the image cache for global installs, so local `npm install`, `npm ci`,
// and Taskfile build flows do not unexpectedly download container images.
// This behavior can be simulated with `npm_config_global=true node scripts/postinstall.mjs`.
const isGlobalInstall = process.env.npm_config_global === 'true';

if (!isGlobalInstall) {
  console.log('Skipping Solo image cache population because this is not a global npm install.');
  process.exit(0);
}

if (soloNoCache) {
  console.log('Skipping Solo image cache population because SOLO_NO_CACHE is enabled.');
  process.exit(0);
}

console.log('Populating Solo image cache...');

const __dirname = dirname(fileURLToPath(import.meta.url));
const soloPath = join(__dirname, '..', 'dist', 'solo.js');

const result = spawnSync(process.execPath, ['--no-deprecation', '--no-warnings', soloPath, 'cache', 'image', 'pull'], {
  stdio: 'inherit',
  shell: false,
});

// Image cache population is a best-effort install optimization.
// A failure here should not fail `npm install -g @hashgraph/solo`, because users can
// still use Solo and manually run `solo cache image pull` later if needed.
if (result.error) {
  console.warn(`Solo image cache population failed to start: ${result.error.message}`);
} else if (result.status !== 0) {
  console.warn(`Solo image cache population failed with exit code ${result.status}. Continuing install.`);
}

process.exit(0);
