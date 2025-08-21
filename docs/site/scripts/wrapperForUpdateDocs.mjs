// SPDX-License-Identifier: Apache-2.0
'use strict';

import path from 'path';
import { fileURLToPath } from "url";
import { run } from "./utilities.mjs";
import kleur from 'kleur';
import { update } from './updateDocs.mjs';

void async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, "../../../");
  process.chdir(projectRoot);

  const version = process.argv[2];
  if (!version) {
    console.error(kleur.red("❌ Error: version argument is required"));
    process.exit(1);
  }

  console.log(kleur.cyan("ℹ Installing gettext-base (apt-get)"));
  await run("sudo apt-get update");
  await run("sudo apt-get install -y gettext-base");

  console.log(kleur.cyan("ℹ Running npm install"));
  await run("npm install");

  console.log(kleur.cyan(`ℹ Setting version to ${version}`));
  await run(`npm version ${version} -f --no-git-tag-version --allow-same-version`);

  console.log(kleur.cyan("ℹ Running task build"));
  await run("task build");

  console.log(kleur.cyan("ℹ Installing and linking @hashgraph/solo"));
  await run("npm install -g @hashgraph/solo");
  await run("npm link");

  await run("which solo");
  await run("solo --version");
  await run("node -p -e 'Boolean(process.stdout.isTTY)'");


  console.log(kleur.cyan("ℹ Running updateDocs"));
  await update();

  // print the generated file
  console.log("::group::Updated step-by-step-guide.md");
  await run(`cat ${path.join(projectRoot, "docs/site/content/en/docs/step-by-step-guide.md")}`);
  console.log("::endgroup::");
}();
