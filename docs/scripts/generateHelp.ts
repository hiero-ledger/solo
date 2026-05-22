// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCapture} from './utilities.js';
import chalk from 'chalk';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const projectRoot: string = path.resolve(__dirname, '../../');
process.chdir(projectRoot);

const OUTPUT_FILE: string = path.join(projectRoot, 'docs/site/content/en/docs/solo-commands.md');
const SOLO_COMMAND: string = 'npm run solo --silent --';

type SoloCommand = {
  output: string;
  topLevelCommands: TopLevelCommand[];
};

type TopLevelCommand = {
  parent: SoloCommand;
  topCommand: string;
  output: string;
  secondLevelCommands: SecondLevelCommand[];
};

type SecondLevelCommand = {
  parent: TopLevelCommand;
  secondCommand: string;
  output: string;
  thirdLevelCommands: ThirdLevelCommand[];
};

type ThirdLevelCommand = {
  parent: SecondLevelCommand;
  thirdCommand: string;
  output: string;
};

async function getTopLevelCommands(): Promise<SoloCommand> {
  try {
    const soloCommand: SoloCommand = {output: undefined, topLevelCommands: []};
    soloCommand.output = await runCapture(`${SOLO_COMMAND} --help`);
    console.log(`${chalk.cyan('✔ Finished retrieving top level commands')}`);
    soloCommand.output
      .split('\n')
      .reduce(
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
      )
      .commands.forEach((command: string) => {
        soloCommand.topLevelCommands.push({
          parent: soloCommand,
          topCommand: command,
          output: undefined,
          secondLevelCommands: undefined,
        });
      });
    return soloCommand;
  } catch (error) {
    console.log(chalk.red('❌ Failed to get top-level commands'));
    process.exit(1);
  }
}

async function getSecondLevelCommands(topLevelCommand: TopLevelCommand): Promise<SecondLevelCommand> {
  try {
    const output: string = await runCapture(`${SOLO_COMMAND} ${topLevelCommand.topCommand} --help`);
    console.log(`${chalk.cyan('✔ Finished top level command: ')}${chalk.gray(topLevelCommand.topCommand)}`);
    return {
      command: cmd,
      output: output,
      subCommands: output
        .split('\n')
        .filter(l => l.trim().startsWith(cmd + ' '))
        .map(l => l.trim().split(/\s+/)[1]),
    };
  } catch {
    console.log(chalk.red(`❌ Failed to get subcommands for ${cmd}`));
    process.exit(1);
  }
}

async function getThirdLevelCommands(cmd: string, subcmd: string): Promise<SecondLevelCommand> {
  try {
    const output: string = await runCapture(`${SOLO_COMMAND} ${cmd} ${subcmd} --help`);
    console.log(`${chalk.cyan('✔ Finished second level command: ')}${chalk.gray(`${cmd} ${subcmd}`)}`);
    return {
      command: cmd,
      subCommand: subcmd,
      output: output,
      subCommands: output
        .split('\n')
        .filter(l => l.trim().startsWith(`${cmd} ${subcmd} `))
        .map(l => l.trim().split(/\s+/)[2]),
    };
  } catch {
    console.log(chalk.red(`❌ Failed to get third-level commands for ${cmd} ${subcmd}`));
    process.exit(1);
  }
}

void (async function main(): Promise<never> {
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
      const secondLevelCommands: TopLevelCommand = await getSecondLevelCommands(cmd);
      await Promise.all(
        secondLevelCommands.subCommands.map(async subcmd => {
          const thirdLevelCommands: SecondLevelCommand = await getThirdLevelCommands(cmd, subcmd);
          await Promise.all(
            thirdLevelCommands.subCommands.map(async subcmd => {
              // run and save the third level output
            }),
          );
        }),
      );
    }),
  );

  // Write all at once
  fs.writeFileSync(OUTPUT_FILE, doc, 'utf-8');

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
  process.exit(0);
})();
