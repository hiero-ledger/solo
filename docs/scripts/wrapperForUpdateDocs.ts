// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import {fileURLToPath} from 'url';
import {run} from './utilities.js';
import chalk from 'chalk';
import {update} from './updateDocs.js';

void (async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '../../');
  process.chdir(projectRoot);

  const version = process.argv[2];
  console.log(`VERSION=${version ?? ''}`);

  if (version) {
    await run(`npm version ${version} -f --no-git-tag-version --allow-same-version`);
  }

  console.log(chalk.cyan('ℹ Running task build:compile'));
  await run('task build:compile');

  console.log(chalk.cyan('ℹ Installing and linking @hiero-ledger/solo'));
  await run('SOLO_NO_CACHE=true npm install -g @hiero-ledger/solo');
  await run('npm link');

  await run('which solo');
  await run('solo --version');
  await run("node -p -e 'Boolean(process.stdout.isTTY)'");

  console.log(chalk.cyan('ℹ Running updateDocs'));
  await update();

  // print the generated file
  console.log('::group::Created solo-command-output.json');
  await run(`cat ${path.join(projectRoot, 'docs/site/build/solo-command-output.json')}`);
  console.log('::endgroup::');
})();
