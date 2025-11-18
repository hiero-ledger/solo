// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class AptGetPackageManager extends ShellRunner implements PackageManager {
  public async installPackages(dependencies: string[]): Promise<void> {
    await this.run(`sudo apt-get install ${dependencies.join(' ')}`);
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.run(`sudo apt-get remove ${dependencies.join(' ')}`);
  }

  public async update(): Promise<void> {
    await this.run('sudo apt-get update');
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.run(`sudo apt-get upgrade ${dependencies.join(' ')}`);
  }

  public async install(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async uninstall(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.run('sudo apt-get -v');
      return true;
    } catch {
      return false;
    }
  }
}
