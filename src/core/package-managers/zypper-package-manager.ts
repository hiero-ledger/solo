// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for openSUSE / SUSE Linux Enterprise distributions that ship zypper.
 */
@injectable()
export class ZypperPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string[] {
    return ['zypper', '--non-interactive', 'install', ...dependencies];
  }

  protected uninstallCommand(dependencies: string[]): string[] {
    return ['zypper', '--non-interactive', 'remove', ...dependencies];
  }

  protected updateCommand(): string[] {
    return ['zypper', '--non-interactive', 'refresh'];
  }

  protected upgradeCommand(dependencies: string[]): string[] {
    return ['zypper', '--non-interactive', 'update', ...dependencies];
  }

  protected versionCommand(): string[] {
    return ['zypper', '--version'];
  }
}
