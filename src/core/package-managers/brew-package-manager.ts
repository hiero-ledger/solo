// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';
import {PathEx} from '../../business/utils/path-ex.js';
import os from 'node:os';

@injectable()
export class BrewPackageManager extends ShellRunner implements PackageManager {
  public async installPackages(dependencies: string[]): Promise<void> {
    await this.runExternalCommand({
      commandPathOrName: 'brew',
      commandArguments: ['install', ...dependencies],
    });
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.runExternalCommand({
      commandPathOrName: 'brew',
      commandArguments: ['uninstall', ...dependencies],
    });
  }

  public async update(): Promise<void> {
    await this.runExternalCommand({
      commandPathOrName: 'brew',
      commandArguments: ['update'],
    });
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.runExternalCommand({
      commandPathOrName: 'brew',
      commandArguments: ['upgrade', ...dependencies],
    });
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.runExternalCommand({
        commandPathOrName: 'brew',
        commandArguments: ['--version'],
      });

      return true;
    } catch {
      return false;
    }
  }

  public async install(): Promise<boolean> {
    await this.downloadAndRunBashScript(
      'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh',
      'homebrew-install.sh',
      {NONINTERACTIVE: '1'},
    );

    process.env.PATH = `${process.env.PATH}:/home/linuxbrew/.linuxbrew/bin`;
    return this.isAvailable();
  }

  public async uninstall(): Promise<void> {
    await this.downloadAndRunBashScript(
      'https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh',
      'homebrew-uninstall.sh',
      {NONINTERACTIVE: '1'},
    );
  }

  private async downloadAndRunBashScript(
    url: string,
    scriptFileName: string,
    environmentVariables: Record<string, string> = {},
  ): Promise<void> {
    const scriptPath: string = PathEx.join(os.tmpdir(), scriptFileName);

    await this.runExternalCommand({
      commandPathOrName: 'curl',
      commandArguments: ['-fsSL', url, '-o', scriptPath],
    });

    await this.runExternalCommand({
      commandPathOrName: '/bin/bash',
      commandArguments: [scriptPath],
      environmentVariables,
    });
  }
}
