// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';

/**
 * Shared base for native Linux package managers. Concrete subclasses provide the
 * distribution-specific command strings; this base handles sudo elevation and the
 * common {@link PackageManager} lifecycle so that callers never need to know which
 * distribution they are running on.
 */
export abstract class LinuxPackageManager extends ShellRunner implements PackageManager {
  private onSudoRequested: (message: string) => void = (): void => {};
  private onSudoGranted: (message: string) => void = (): void => {};

  public setOnSudoRequested(callback: (message: string) => void): void {
    this.onSudoRequested = callback;
  }

  public setOnSudoGranted(callback: (message: string) => void): void {
    this.onSudoGranted = callback;
  }

  /** Builds the command that installs the given packages. */
  protected abstract installCommand(dependencies: string[]): string;

  /** Builds the command that removes the given packages. */
  protected abstract uninstallCommand(dependencies: string[]): string;

  /** Builds the command that refreshes the package index/metadata. */
  protected abstract updateCommand(): string;

  /** Builds the command that upgrades the given packages. */
  protected abstract upgradeCommand(dependencies: string[]): string;

  /** Builds the command used to check that the package manager is available (no sudo required). */
  protected abstract versionCommand(): string;

  public async installPackages(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, this.installCommand(dependencies));
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, this.uninstallCommand(dependencies));
  }

  public async update(): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, this.updateCommand());
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.sudoRun(this.onSudoRequested, this.onSudoGranted, this.upgradeCommand(dependencies));
  }

  public async install(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async uninstall(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.run(this.versionCommand());
      return true;
    } catch {
      return false;
    }
  }
}
