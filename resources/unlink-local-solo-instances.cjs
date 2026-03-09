// SPDX-License-Identifier: Apache-2.0

import 'dotenv/config';
import {spawn} from 'node:child_process';
import os from 'node:os';

const SOLO_PACKAGES_TO_UNLINK = ['@hashgraph/solo', '@hiero-ledger/solo'];

async function run(cmd, arguments_ = []) {
  const message = `Executing command${OperatingSystem.isWin32() ? ' (Windows)' : ''}: '${cmd}' ${arguments_.join(' ')}`;
const callStack = new Error(message).stack; // capture the callstack to be included in error
console.info(message);

const IS_WIN32 = os.platform() === 'win32';

return new Promise( (resolve, reject) => {
  const child = spawn(cmd, arguments_, {
    shell: true,
    detached,
    stdio: detached ? 'ignore' : undefined,
    windowsVerbatimArguments: IS_WIN32,
    windowsHide: IS_WIN32
  });

  const output = [];
  child.stdout.on('data', data => {
    const items = data.toString().split(/\r?\n/);
    for (const item of items) {
      if (item) {
        output.push(item);
      }
    }
  });

  const errorOutput = [];
  child.stderr.on('data', data => {
    const items = data.toString().split(/\r?\n/);
    for (const item of items) {
      if (item) {
        errorOutput.push(item.trim());
      }
    }
  });

  child.on('exit', (code, signal) => {
    if (code) {
      const error = new Error(
        `Command exit with error code ${code}, [command: '${cmd}'], [message: '${errorOutput.join('\n')}']`,
      );

      error.stack = callStack;
      console.error(`Error executing: '${cmd}'`, {
        commandExitCode: code,
        commandExitSignal: signal,
        commandOutput: output,
        errOutput: errorOutput,
        error: {message: error.message, stack: error.stack},
      });

      reject(error);
    }

    console.debug(
      `Finished executing: '${cmd}', ${JSON.stringify({
        commandExitCode: code,
        commandExitSignal: signal,
        commandOutput: output,
        errOutput: errorOutput,
      })}`,
    );

    resolve(output);
  });
});
}

async function detectGlobalLinkedSoloPackages() {
  try {
    const listResult = await run('npm list --global --depth=0');
    const foundLinkedPackages = [];

    for (const item of listResult) {
      // Check if any of the globally linked packages match the SOLO_PACKAGES_TO_UNLINK
      // and unlink them if they point to a local directory (indicated by '->' in the npm list output)
      const matchesSoloPackages = SOLO_PACKAGES_TO_UNLINK.filter(
        soloPackage => item.includes(soloPackage) && item.includes('->'),
    );
      for (const packageName of matchesSoloPackages) {
        try {
          const logMessage = `Found locally linked installation of ${packageName}.`;
          console.info(logMessage);
          foundLinkedPackages.push(packageName);
        } catch (error) {
          console.error(
            `Failed to parse npm list output line "${item}". Please check for any globally linked Solo packages and unlink them manually using "npm unlink -g <package-name>".`,
            error,
          );
        }
      }
    }

    return foundLinkedPackages;
  } catch (error) {
    console.warn(
      'Failed to detect globally linked Solo packages. Please check for any globally linked Solo packages and' +
      ' unlink them manually using "npm unlink -g <package-name>".',
      error,
    );
    return [];
  }
}

async function unlinkLocalSoloPackages() {
  const linkedPackages = await detectGlobalLinkedSoloPackages();

  for (const packageName of linkedPackages) {
    console.debug(`Unlinking earlier global installation of ${packageName}`);
    try {
      const unlinkOutput = await run(`npm unlink -g ${packageName}`);
      for (const line of unlinkOutput) {
        console.info(`npm unlink: ${line}`);
      }
      console.debug(`Successfully unlinked ${packageName}`);
    } catch (error) {
      console.error(
        `Failed to unlink earlier global installation of ${packageName}. Please manually run "npm unlink -g ${packageName}" to unlink.`,
        error,
      );
    }
  }
}

(async () => {
  await unlinkLocalSoloPackages();
})();
