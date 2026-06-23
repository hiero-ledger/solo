// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for Alpine Linux, which ships apk.
 */
@injectable()
export class ApkPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string {
    return `apk add ${dependencies.join(' ')}`;
  }

  protected uninstallCommand(dependencies: string[]): string {
    return `apk del ${dependencies.join(' ')}`;
  }

  protected updateCommand(): string {
    return 'apk update';
  }

  protected upgradeCommand(dependencies: string[]): string {
    return `apk upgrade ${dependencies.join(' ')}`;
  }

  protected versionCommand(): string {
    return 'apk --version';
  }
}
