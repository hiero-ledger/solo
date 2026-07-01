// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for older RPM-based distributions that ship yum (RHEL 7, CentOS 7, Amazon Linux 2, ...).
 */
@injectable()
export class YumPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string[] {
    return ['yum', 'install', '-y', ...dependencies];
  }

  protected uninstallCommand(dependencies: string[]): string[] {
    return ['yum', 'remove', '-y', ...dependencies];
  }

  protected updateCommand(): string[] {
    return ['yum', 'makecache'];
  }

  protected upgradeCommand(dependencies: string[]): string[] {
    return ['yum', 'upgrade', '-y', ...dependencies];
  }

  protected versionCommand(): string[] {
    return ['yum', '--version'];
  }
}
