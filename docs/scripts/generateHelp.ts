// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCapture} from './utilities.js';
import chalk from 'chalk';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const projectRoot: string = path.resolve(__dirname, '../../../');
process.chdir(projectRoot);

const OUTPUT_FILE: string = path.join(projectRoot, 'docs/site/content/en/docs/solo-commands.md');
const SOLO_COMMAND: string = 'npm run solo --silent --';
type TopLevelCommand = {
  output: string;
  commands: string[];
};

/**
 * @returns {Promise<{ output:string, commands:[] }>}
 */
async function getTopLevelCommands(): Promise<TopLevelCommand> {
  try {
    const output: string = await runCapture(`${SOLO_COMMAND} --help`);
    return {
      output: output,
      commands: output.split('\n').reduce(
        (acc, line) => {
          if (line.trim().startsWith('Commands:')) {
            acc.inCommands = true;
            return acc;
          }
          if (line.trim().startsWith('Options:')) {
            acc.inCommands = false;
            return acc;
          }
          if (acc.inCommands && line.trim()) {
            acc.commands.push(line.trim().split(/\s+/)[0]);
          }
          return acc;
        },
        {inCommands: false, commands: []},
      ).commands,
    };
  } catch {
    console.log(chalk.red('Failed to get top-level commands'));
    process.exit(1);
  }
}

/**
 * @param {string} cmd
 * @returns {Promise<{ output:string, subCommands:[] }>}
 */
async function getSubcommands(cmd) {
  try {
    const output = await runCapture(`${SOLO_COMMAND} ${cmd} --help`);
    return {
      output: output,
      subCommands: output
        .split('\n')
        .filter(l => l.trim().startsWith(cmd + ' '))
        .map(l => l.trim().split(/\s+/)[1]),
    };
  } catch {
    console.log(chalk.red(`Failed to get subcommands for ${cmd}`));
    process.exit(1);
  }
}

/**
 * @param {string} cmd
 * @param {string} subcmd
 * @returns {Promise<{ output:string, subCommands:[] }>}
 */
async function getThirdLevelCommands(cmd, subcmd) {
  try {
    const output = await runCapture(`${SOLO_COMMAND} ${cmd} ${subcmd} --help`);
    return {
      output: output,
      subCommands: output
        .split('\n')
        .filter(l => l.trim().startsWith(`${cmd} ${subcmd} `))
        .map(l => l.trim().split(/\s+/)[2]),
    };
  } catch {
    console.log(chalk.red(`Failed to get third-level commands for ${cmd} ${subcmd}`));
    process.exit(1);
  }
}

void (async function main() {
  let doc = '';

  // Header
  doc += `# Solo Command Reference\n\n`;
  doc += `## Table of Contents\n`;
  doc += `\n* [Root Help Output](#root-help-output)\n`;

  // Top-level commands
  const topLevelOutput = await getTopLevelCommands();

  // Build Table of Contents sequentially
  await Promise.all(
    topLevelOutput.commands.map(async cmd => {
      console.log(`#1 Processing command: ${chalk.green(cmd)}`);
      let entry = `\n* [${cmd}](#${cmd})`;

      const subcommands = await getSubcommands(cmd);
      Promise.all(
        subcommands.map(async subcmd => {
          console.log(`#1 Processing subcommand: ${chalk.green(cmd)} ${chalk.cyan(subcmd)}`);
          let sub = `\n  * [${cmd} ${subcmd}](#${cmd}-${subcmd})`;

          const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
          for (const t of thirdLevel) {
            sub += `\n    * [${cmd} ${subcmd} ${t}](#${cmd}-${subcmd}-${t})`;
          }

          entry += sub;
        }),
      );

      doc += entry;
    }),
  );

  // Root help output
  doc += `\n\n## Root Help Output\n\n`;
  doc += '```\n';
  doc += await runCapture(`${SOLO_COMMAND} --help`);
  doc += '\n```\n';

  // Detailed sections sequentially
  for (const cmd of commands) {
    console.log(`#2 Processing command: ${chalk.green(cmd)}`);

    let section = `\n## ${cmd}\n\n\`\`\`\n`;
    section += await runCapture(`${SOLO_COMMAND} ${cmd} --help`);
    section += `\n\`\`\`\n`;

    const subcommands = await getSubcommands(cmd);
    for (const subcmd of subcommands) {
      console.log(`#2 Processing subcommand: ${chalk.green(cmd)} ${chalk.cyan(subcmd)}`);

      let subSection = `\n### ${cmd} ${subcmd}\n\n\`\`\`\n`;
      subSection += await runCapture(`${SOLO_COMMAND} ${cmd} ${subcmd} --help`);
      subSection += `\n\`\`\`\n`;

      const thirdLevel = await getThirdLevelCommands(cmd, subcmd);
      for (const t of thirdLevel) {
        console.log(`#3 Processing third-level command: ${chalk.green(cmd)} ${chalk.cyan(subcmd)} ${chalk.yellow(t)}`);

        let third = `\n#### ${cmd} ${subcmd} ${t}\n\n\`\`\`\n`;
        third += await runCapture(`${SOLO_COMMAND} ${cmd} ${subcmd} ${t} --help`);
        third += `\n\`\`\`\n`;

        subSection += third;
      }

      section += subSection;
    }

    doc += section;
  }

  // Write all at once
  fs.writeFileSync(OUTPUT_FILE, doc, 'utf-8');

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
  process.exit(0);
})();
