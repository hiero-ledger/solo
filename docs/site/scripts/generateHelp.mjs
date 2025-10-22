// SPDX-License-Identifier: Apache-2.0
'use strict';

import fs from "node:fs";
import path from 'node:path';
import { fileURLToPath } from "node:url";
import { runCapture } from "./utilities.mjs";
import kleur from 'kleur';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../");
process.chdir(projectRoot);

const OUTPUT_FILE = path.join(projectRoot, "docs/site/content/en/docs/solo-commands.md");

/**
 * @returns {Promise<string[]>}
 */
async function getTopLevelCommands() {
  try {
    const output = await runCapture("npm run solo-test --silent -- --help");
    return output
      .split("\n")
      .reduce(
        (acc, line) => {
          if (line.trim().startsWith("Commands:")) {
            acc.inCommands = true;
            return acc;
          }
          if (line.trim().startsWith("Options:")) {
            acc.inCommands = false;
            return acc;
          }
          if (acc.inCommands && line.trim()) {
            acc.commands.push(line.trim().split(/\s+/)[0]);
          }
          return acc;
        },
        { inCommands: false, commands: [] }
      ).commands;
  } catch {
    return [];
  }
}

/**
 * @param {string} cmd
 * @returns {Promise<string[]>}
 */
async function getSubcommands(cmd) {
  try {
    const output = await runCapture(`npm run solo-test --silent -- ${cmd} --help`);
    return output
      .split("\n")
      .filter((l) => l.trim().startsWith(cmd + " "))
      .map((l) => l.trim().split(/\s+/)[1]);
  } catch {
    return [];
  }
}

/**
 * @param {string} cmd
 * @param {string} subcmd
 * @returns {Promise<string[]>}
 */
async function getThirdLevelCommands(cmd, subcmd) {
  try {
    const output = await runCapture(`npm run solo-test --silent -- ${cmd} ${subcmd} help`);
    return output
      .split("\n")
      .filter((l) => l.trim().startsWith(`${cmd} ${subcmd} `))
      .map((l) => l.trim().split(/\s+/)[2]);
  } catch {
    return [];
  }
}

void async function main() {
  let doc = "";

  // Header/front matter
  doc += `---\n`;
  doc += `title: "Solo CLI Commands"\n`;
  doc += `weight: 40\n`;
  doc += `description: >\n`;
  doc += `    This document provides a comprehensive reference for the Solo CLI commands, including their options and usage.\n`;
  doc += `---\n\n`;
  doc += `# Solo Command Reference\n\n`;
  doc += `## Table of Contents\n`;
  doc += `\n* [Root Help Output](#root-help-output)\n`;

  // Top-level commands
  const commands = await getTopLevelCommands();

  // Build Table of Contents sequentially
  for (const cmd of commands) {
    console.log(`#1 Processing command: ${kleur.green(cmd)}`);
    let entry = `\n* [${cmd}](#${cmd})`;

    const subcommands = await getSubcommands(cmd);
    for (const subcmd of subcommands) {
      console.log(`#1 Processing subcommand: ${kleur.green(cmd)} ${kleur.cyan(subcmd)}`);
      let sub = `\n  * [${cmd} ${subcmd}](#${cmd}-${subcmd})`;

      const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
      for (const t of thirdLevel) {
        sub += `\n    * [${cmd} ${subcmd} ${t}](#${cmd}-${subcmd}-${t})`;
      }

      entry += sub;
    }

    doc += entry;
  }

  // Root help output
  doc += `\n\n## Root Help Output\n\n`;
  doc += "```\n";
  doc += await runCapture(`npm run solo-test --silent -- --help`);
  doc += "\n```\n";

  // Detailed sections sequentially
  for (const cmd of commands) {
    console.log(`#2 Processing command: ${kleur.green(cmd)}`);

    let section = `\n## ${cmd}\n\n\`\`\`\n`;
    section += await runCapture(`npm run solo-test --silent -- ${cmd} --help`);
    section += `\n\`\`\`\n`;

    const subcommands = await getSubcommands(cmd);
    for (const subcmd of subcommands) {
      console.log(`#2 Processing subcommand: ${kleur.green(cmd)} ${kleur.cyan(subcmd)}`);

      let subSection = `\n### ${cmd} ${subcmd}\n\n\`\`\`\n`;
      subSection += await runCapture(`npm run solo-test --silent -- ${cmd} ${subcmd} --help`);
      subSection += `\n\`\`\`\n`;

      const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
      for (const t of thirdLevel) {
        console.log(`#3 Processing third-level command: ${kleur.green(cmd)} ${kleur.cyan(subcmd)} ${kleur.yellow(t)}`);

        let third = `\n#### ${cmd} ${subcmd} ${t}\n\n\`\`\`\n`;
        third += await runCapture(`npm run solo-test --silent -- ${cmd} ${subcmd} ${t} --help`);
        third += `\n\`\`\`\n`;

        subSection += third;
      }

      section += subSection;
    }

    doc += section;
  }

  // Write all at once
  fs.writeFileSync(OUTPUT_FILE, doc, "utf-8");

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
  process.exit(0);
}();
