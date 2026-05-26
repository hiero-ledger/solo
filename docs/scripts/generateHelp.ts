// SPDX-License-Identifier: Apache-2.0

import fs, {writeFileSync} from 'node:fs';
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
          secondLevelCommands: [],
        });
      });
    return soloCommand;
  } catch (error) {
    console.log(chalk.red('❌ Failed to get top-level commands'));
    process.exit(1);
  }
}

async function getSecondLevelCommands(topLevelCommand: TopLevelCommand): Promise<void> {
  try {
    topLevelCommand.output = await runCapture(`${SOLO_COMMAND} ${topLevelCommand.topCommand} --help`);
    console.log(`${chalk.cyan('✔ Finished top level command: ')}${chalk.gray(topLevelCommand.topCommand)}`);
    const commands: string[] = topLevelCommand.output
      .split('\n')
      .filter(l => l.trim().startsWith(topLevelCommand.topCommand + ' '))
      .map(l => l.trim().split(/\s+/)[1]);

    commands.forEach((secondLevelCommand: string) => {
      topLevelCommand.secondLevelCommands.push({
        parent: topLevelCommand,
        secondCommand: secondLevelCommand,
        output: undefined,
        thirdLevelCommands: [],
      });
    });
  } catch {
    console.log(chalk.red(`❌ Failed to get subcommands for ${topLevelCommand.topCommand}`));
    process.exit(1);
  }
}

async function getThirdLevelCommands(secondLevelCommand: SecondLevelCommand): Promise<void> {
  const {
    parent: {topCommand},
    secondCommand,
  } = secondLevelCommand;
  try {
    secondLevelCommand.output = await runCapture(`${SOLO_COMMAND} ${topCommand} ${secondCommand} --help`);
    console.log(`${chalk.cyan('✔ Finished second level command: ')}${chalk.gray(`${topCommand} ${secondCommand}`)}`);

    const commands: string[] = secondLevelCommand.output
      .split('\n')
      .filter(l => l.trim().startsWith(`${topCommand} ${secondCommand} `))
      .map(l => l.trim().split(/\s+/)[2]);

    commands.forEach((thirdLevelCommand: string) => {
      secondLevelCommand.thirdLevelCommands.push({
        parent: secondLevelCommand,
        thirdCommand: thirdLevelCommand,
        output: undefined,
      });
    });
  } catch {
    console.log(chalk.red(`❌ Failed to get third-level commands for ${topCommand} ${secondCommand}`));
    process.exit(1);
  }
}

async function getOutputForThirdLevelCommand(thirdLevelCommand: ThirdLevelCommand): Promise<void> {
  const {
    parent: {
      parent: {topCommand},
      secondCommand,
    },
    thirdCommand,
  } = thirdLevelCommand;
  try {
    thirdLevelCommand.output = await runCapture(
      `${SOLO_COMMAND} ${topCommand} ${secondCommand} ${thirdCommand} --help`,
    );
    console.log(
      `${chalk.cyan('✔ Finished third level command: ')}${chalk.gray(`${topCommand} ${secondCommand} ${thirdCommand}`)}`,
    );
  } catch {
    console.log(chalk.red(`❌ Failed to get output for ${topCommand} ${secondCommand} ${thirdCommand}`));
    process.exit(1);
  }
}

function generateMarkdown(soloCommand: SoloCommand): string {
  let markdown: string = `
## Overview

This page is the canonical command reference for the Solo CLI.

- Use it to look up command paths, subcommands, and flags.
- Use \`solo <command> --help\` and \`solo <command> <subcommand> --help\` for runtime help on your installed version.
- For legacy command mappings, see [CLI Migration Reference](/docs/advanced-solo-setup/cli/cli-migrations).

## Output Formats (\`--output\`, \`-o\`)

Solo supports machine-readable output for version output and for command execution flows that honor the output format flag.

\`\`\`text
solo --version -o json
solo --version -o yaml
solo --version -o wide
\`\`\`

Expected formats:

- \`json\`: JSON object output.
- \`yaml\`: YAML output.
- \`wide\`: plain text value-oriented output.

## Global Flags

Global flags shown in root help:

- \`--dev\`: enable developer mode.
- \`--force-port-forward\`: force port forwarding for network services.
- \`-v\`, \`--version\`: print Solo version.

## Command and Flag Reference

The sections below are generated from Solo CLI help output using the implementation on \`hiero-ledger/solo\` (main), commit \`f800d3c\`.

## Root Help Output

\`\`\`
`;
  markdown += filterOutputNoise(soloCommand.output) + '\n';
  return markdown;
}

function filterOutputNoise(output: string): string {
  // remove lines that start with '>> environment variable'
  return output
    .split('\n')
    .filter(line => !line.trim().startsWith('>> environment variable'))
    .join('\n');
}

void (async function main(): Promise<never> {
  const soloCommand: SoloCommand = await getTopLevelCommands();

  await Promise.all(
    soloCommand.topLevelCommands.map(async topLevelCommand => {
      await getSecondLevelCommands(topLevelCommand);
      await Promise.all(
        topLevelCommand.secondLevelCommands.map(async secondLevelCommand => {
          await getThirdLevelCommands(secondLevelCommand);
          await Promise.all(
            secondLevelCommand.thirdLevelCommands.map(async thirdLevelCommand => {
              await getOutputForThirdLevelCommand(thirdLevelCommand);
            }),
          );
        }),
      );
    }),
  );

  const fileContents: string = generateMarkdown(soloCommand);

  // Write all at once
  fs.writeFileSync(OUTPUT_FILE, fileContents, 'utf-8');

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
  process.exit(0);
})();
