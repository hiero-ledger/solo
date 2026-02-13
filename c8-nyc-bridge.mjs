// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'path';

export function main() {
  const cwd = process.cwd();
  const nycModulePath = path.join(cwd, 'node_modules', 'nyc');
  if (fs.existsSync(nycModulePath)) {
    fs.rmdirSync(nycModulePath, {recursive: true});
  }

  const c8SourcePath = path.join(cwd, 'node_modules', 'c8');
  if (!fs.existsSync(c8SourcePath)) {
    throw new Error('c8 is not installed, unable to bridge to nyc');
  }

  // Create a symlink from node_modules/nyc to node_modules/c8
  // Only use directory symlink to avoid issues with Windows
  fs.symlinkSync(c8SourcePath, nycModulePath, 'dir');
}

main();
