// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'path';

export function main() {
  const cwd = process.cwd();
  const nycModulePath = path.join(cwd, 'node_modules', 'nyc');
  if (fs.existsSync(nycModulePath)) {
    console.log(`Removing existing nyc module at ${nycModulePath} to create a symlink to c8`);
    try {
      fs.rmSync(nycModulePath, {recursive: true, force: true});
    } catch (err) {
      console.error(`Failed to remove existing nyc module at ${nycModulePath}: ${err}`);
      throw err;
    }
  }

  const c8SourcePath = path.join(cwd, 'node_modules', 'c8');
  if (!fs.existsSync(c8SourcePath)) {
    throw new Error('c8 is not installed, unable to bridge to nyc');
  }

  // Create a symlink from node_modules/nyc to node_modules/c8
  // Use junction mode to avoid admin/developer mode issues with Windows
  // use directory mode for non windows platforms
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(c8SourcePath, nycModulePath, symlinkType);
    fs.copyFileSync(path.join(c8SourcePath, 'bin', 'c8.js'), path.join(c8SourcePath, 'bin', 'nyc.js'));
  } catch (err) {
    console.error(`Failed to create symlink from ${c8SourcePath} to ${nycModulePath} in ${symlinkType} mode: ${err}`);
    throw err;
  }

  console.log(`Successfully created symlink from ${c8SourcePath} to ${nycModulePath}`);
}

main();
