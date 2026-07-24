// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from '../shell-runner.js';
import {type PackageManager} from './package-manager.js';

/**
 * Shared base for native Linux package managers. Concrete subclasses provide the
 * distribution-specific command argv arrays; this base handles sudo elevation and the
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

  /** Builds the argv that installs the given packages (executable first, then arguments). */
  protected abstract installCommand(dependencies: string[]): string[];

  /** Builds the argv that removes the given packages. */
  protected abstract uninstallCommand(dependencies: string[]): string[];

  /** Builds the argv that refreshes the package index/metadata. */
  protected abstract updateCommand(): string[];

  /** Builds the argv that upgrades the given packages. */
  protected abstract upgradeCommand(dependencies: string[]): string[];

  /** Builds the argv used to check that the package manager is available (no sudo required). */
  protected abstract versionCommand(): string[];

  /**
   * Maps the generic dependency names callers pass to the names this distribution actually ships.
   * Defaults to the identity mapping; subclasses override it when a package is named differently.
   */
  protected resolveDependencies(dependencies: string[]): string[] {
    return dependencies;
  }

  public async installPackages(dependencies: string[]): Promise<void> {
    await this.runWithSudo(this.installCommand(this.resolveDependencies(dependencies)));
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.runWithSudo(this.uninstallCommand(this.resolveDependencies(dependencies)));
  }

  public async update(): Promise<void> {
    await this.runWithSudo(this.updateCommand());
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.runWithSudo(this.upgradeCommand(this.resolveDependencies(dependencies)));
  }

  public async install(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async uninstall(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public async isAvailable(): Promise<boolean> {
    const [command, ...arguments_]: string[] = this.versionCommand();
    try {
      await this.run(command, arguments_);
      return true;
    } catch {
      // best-effort: report unavailable when the version probe fails (e.g. the binary is absent)
      return false;
    }
  }

  /** Runs a package-manager argv under sudo, surfacing the elevation prompts to the configured callbacks. */
  private async runWithSudo(command: string[]): Promise<string[]> {
    const [executable, ...arguments_]: string[] = command;
    return this.sudoRun(this.onSudoRequested, this.onSudoGranted, executable, arguments_);
  }
}
