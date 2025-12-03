// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class AptGetPackageManager extends ShellRunner implements PackageManager {
  private onSudoRequested: (message: string) => void = (message: string) => {};
  private onSudoGranted: (message: string) => void = (message: string) => {};

  constructor() {
    super();
  }

  public setOnSudoRequested(callback: (message: string) => void): void {
    this.onSudoRequested = callback;
  }

  public setOnSudoGranted(callback: (message: string) => void): void {
    this.onSudoGranted = callback;
  }

  public async installPackages(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, `apt-get install ${dependencies.join(' ')}`);
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, `apt-get remove ${dependencies.join(' ')}`);
  }

  public async update(): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, 'apt-get update');
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, `apt-get upgrade ${dependencies.join(' ')}`);
  }

  public async install(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async uninstall(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.sudoRun(this.onSudoRequested, this.onSudoGranted, 'apt-get -v');
      return true;
    } catch {
      return false;
    }
  }
}
