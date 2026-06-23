// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for RPM-based distributions that ship dnf (Fedora, RHEL, Rocky, AlmaLinux, ...).
 */
@injectable()
export class DnfPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string {
    return `dnf install -y ${dependencies.join(' ')}`;
  }

  protected uninstallCommand(dependencies: string[]): string {
    return `dnf remove -y ${dependencies.join(' ')}`;
  }

  protected updateCommand(): string {
    return 'dnf makecache';
  }

  protected upgradeCommand(dependencies: string[]): string {
    return `dnf upgrade -y ${dependencies.join(' ')}`;
  }

  protected versionCommand(): string {
    return 'dnf --version';
  }
}
