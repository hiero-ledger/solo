// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class BrewPackageManager extends ShellRunner implements PackageManager {
  public async installPackages(dependencies: string[]): Promise<void> {
    await this.run(`brew install ${dependencies.join(' ')}`);
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.run(`brew uninstall ${dependencies.join(' ')}`);
  }

  public async update(): Promise<void> {
    await this.run('brew update');
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.run(`brew upgrade ${dependencies.join(' ')}`);
  }

  public async install(): Promise<boolean> {
    await this.run(
      'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    );
    await this.run('eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"');
    process.env.PATH = `${process.env.PATH}:/home/linuxbrew/.linuxbrew/bin`;
    return this.isAvailable();
  }

  public async uninstall(): Promise<void> {
    await this.run(
      'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"',
    );
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.run('brew --version');
      return true;
    } catch {
      return false;
    }
  }
}
