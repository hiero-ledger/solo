// SPDX-License-Identifier: Apache-2.0
'use strict';

import fs from "node:fs";
import path from 'node:path';
import { fileURLToPath } from "node:url";
import { runCapture, run } from "./utilities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../");
process.chdir(projectRoot);

const OUTPUT_FILE = path.join(projectRoot, "docs/site/content/en/docs/solo-commands.md");

function write(line = "") {
  fs.appendFileSync(OUTPUT_FILE, line + "\n");
}

/**
 * @returns {Promise<string[]>}
 */
async function getTopLevelCommands() {
  try {
    const output = await runCapture("npm run solo-test -- --help");
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
    const output = await runCapture(`npm run solo-test -- ${cmd} --help`);
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
    const output = await runCapture(`npm run solo-test -- ${cmd} ${subcmd} help`);
    return output
      .split("\n")
      .filter((l) => l.trim().startsWith(`${cmd} ${subcmd} `))
      .map((l) => l.trim().split(/\s+/)[2]);
  } catch {
    return [];
  }
}

void async function main() {

  // Initialize output file
  fs.writeFileSync(OUTPUT_FILE, "");
  write("---");
  write('title: "Solo CLI Commands"');
  write("weight: 40");
  write("description: >");
  write("    This document provides a comprehensive reference for the Solo CLI commands, including their options and usage.");
  write("---");
  write("");
  write("# Solo Command Reference");
  write("");
  write("## Table of Contents");
  write("\n* [Root Help Output](#root-help-output)");

  // Top-level commands
  const commands = await getTopLevelCommands();

  // Build Table of Contents
  for (const cmd of commands) {
    console.log(`#1 Processing command: ${cmd}`);
    write(`\n* [${cmd}](#${cmd})`);

    const subcommands = await getSubcommands(cmd);

    for (const subcmd of subcommands) {
      console.log(`#1 Processing subcommand: ${cmd} ${subcmd}`);
      write(`\n  * [${cmd} ${subcmd}](#${cmd}-${subcmd})`);

      const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
      for (const t of thirdLevel) {
        write(`\n    * [${cmd} ${subcmd} ${t}](#${cmd}-${subcmd}-${t})`);
      }
    }
  }

  // Root help output
  write("\n## Root Help Output\n");
  write("```");
  await run(`npm run solo-test -- --help >> ${OUTPUT_FILE}`);
  write("```");

  // Detailed sections
  for (const cmd of commands) {
    console.log(`#2 Processing command: ${cmd}`);
    write(`\n## ${cmd}\n`);
    write("```");
    await run(`npm run solo-test -- ${cmd} --help >> ${OUTPUT_FILE}`);
    write("```");

    const subcommands = await getSubcommands(cmd);
    for (const subcmd of subcommands) {
      console.log(`#2 Processing subcommand: ${cmd} ${subcmd}`);
      write(`\n### ${cmd} ${subcmd}\n`);
      write("```");
      await run(`npm run solo-test -- ${cmd} ${subcmd} --help >> ${OUTPUT_FILE}`);
      write("```");

      const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
      for (const t of thirdLevel) {
        console.log(`#3 Processing third-level command: ${cmd} ${subcmd} ${t}`);
        write(`\n#### ${cmd} ${subcmd} ${t}\n`);
        write("```");
        await run(`npm run solo-test -- ${cmd} ${subcmd} ${t} --help >> ${OUTPUT_FILE}`);
        write("```");
      }
    }
  }

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
}();