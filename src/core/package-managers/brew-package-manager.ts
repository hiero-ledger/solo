// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class BrewPackageManager extends ShellRunner implements PackageManager {
  public async installPackages(dependencies: string[]): Promise<void> {
    await this.runCommand('brew', ['install', ...dependencies]);
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.runCommand('brew', ['uninstall', ...dependencies]);
  }

  public async update(): Promise<void> {
    await this.runCommand('brew', ['update']);
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.runCommand('brew', ['upgrade', ...dependencies]);
  }

  public async install(): Promise<boolean> {
    await this.runCommand(
      '/bin/bash',
      ['-c', 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | /bin/bash'],
      false,
      false,
      {
        NONINTERACTIVE: '1',
      },
    );

    process.env.PATH = `${process.env.PATH}:/home/linuxbrew/.linuxbrew/bin`;
    return this.isAvailable();
  }

  public async uninstall(): Promise<void> {
    await this.runCommand(
      '/bin/bash',
      ['-c', 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh | /bin/bash'],
      false,
      false,
      {
        NONINTERACTIVE: '1',
      },
    );
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.runCommand('brew', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
