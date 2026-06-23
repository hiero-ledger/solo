// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for Arch-based distributions that ship pacman (Arch, Manjaro, EndeavourOS, ...).
 */
@injectable()
export class PacmanPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string {
    return `pacman -S --noconfirm ${dependencies.join(' ')}`;
  }

  protected uninstallCommand(dependencies: string[]): string {
    return `pacman -R --noconfirm ${dependencies.join(' ')}`;
  }

  protected updateCommand(): string {
    return 'pacman -Sy --noconfirm';
  }

  protected upgradeCommand(dependencies: string[]): string {
    return `pacman -S --noconfirm ${dependencies.join(' ')}`;
  }

  protected versionCommand(): string {
    return 'pacman --version';
  }
}
