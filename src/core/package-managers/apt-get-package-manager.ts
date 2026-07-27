// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for Debian-based distributions that ship apt-get (Debian, Ubuntu, Mint, ...).
 */
@injectable()
export class AptGetPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string[] {
    return ['apt-get', 'install', '-y', ...dependencies];
  }

  protected uninstallCommand(dependencies: string[]): string[] {
    return ['apt-get', 'remove', '-y', ...dependencies];
  }

  protected updateCommand(): string[] {
    return ['apt-get', 'update'];
  }

  protected upgradeCommand(dependencies: string[]): string[] {
    return ['apt-get', 'upgrade', '-y', ...dependencies];
  }

  protected versionCommand(): string[] {
    return ['apt-get', '--version'];
  }
}
