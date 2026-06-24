// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class BrewPackageManager extends ShellRunner implements PackageManager {
  private static readonly INSTALL_SCRIPT_URL: string =
    'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh';
  private static readonly UNINSTALL_SCRIPT_URL: string =
    'https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh';
  private static readonly LINUXBREW_BIN: string = '/home/linuxbrew/.linuxbrew/bin';

  public async installPackages(dependencies: string[]): Promise<void> {
    await this.run('brew', ['install', ...dependencies]);
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.run('brew', ['uninstall', ...dependencies]);
  }

  public async update(): Promise<void> {
    await this.run('brew', ['update']);
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.run('brew', ['upgrade', ...dependencies]);
  }

  public async install(): Promise<boolean> {
    await this.runHomebrewScript(BrewPackageManager.INSTALL_SCRIPT_URL);
    await this.applyShellEnvironment();
    process.env.PATH = `${process.env.PATH}${path.delimiter}${BrewPackageManager.LINUXBREW_BIN}`;
    return this.isAvailable();
  }

  public async uninstall(): Promise<void> {
    await this.runHomebrewScript(BrewPackageManager.UNINSTALL_SCRIPT_URL);
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.run('brew', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Downloads a Homebrew install/uninstall script and runs it with bash, without invoking a shell to
   * perform command substitution (replaces the previous `bash -c "$(curl …)"` pattern).
   */
  private async runHomebrewScript(scriptUrl: string): Promise<void> {
    const scriptPath: string = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-brew-')), 'homebrew.sh');
    try {
      await this.run('curl', ['-fsSL', scriptUrl, '-o', scriptPath]);
      await this.run('bash', [scriptPath], true, false, {NONINTERACTIVE: '1'});
    } finally {
      fs.rmSync(scriptPath, {force: true});
    }
  }

  /**
   * Applies the environment that `brew shellenv` would export, without a shell `eval`. Parses the
   * `export KEY="VALUE";` lines and expands references to the current PATH so the values are correct.
   */
  private async applyShellEnvironment(): Promise<void> {
    const output: string[] = await this.run(`${BrewPackageManager.LINUXBREW_BIN}/brew`, ['shellenv']);
    const currentPath: string = process.env.PATH ?? '';
    for (const line of output) {
      const match: RegExpMatchArray | null = line.match(/^export ([A-Za-z_][\w]*)="(.*)";?$/);
      if (!match) {
        continue;
      }
      const [, key, rawValue]: string[] = match;
      // brew emits values such as "/home/linuxbrew/.linuxbrew/bin${PATH+:$PATH}"; expand those to the
      // current PATH so the resulting value is correct without a shell performing the expansion.
      process.env[key] = rawValue
        .replaceAll('${PATH+:$PATH}', currentPath ? `${path.delimiter}${currentPath}` : '')
        .replaceAll('$PATH', currentPath);
    }
  }
}
