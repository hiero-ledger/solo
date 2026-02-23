// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {PackageManager} from './package-manager.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {BrewPackageManager} from './brew-package-manager.js';
import {AptGetPackageManager} from './apt-get-package-manager.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

@injectable()
export class OsPackageManager {
  protected packageManager: PackageManager;

  public constructor(
    @inject(InjectTokens.BrewPackageManager) protected readonly brewPackageManager: BrewPackageManager,
    @inject(InjectTokens.AptGetPackageManager) protected readonly aptGetPackageManager: AptGetPackageManager,
  ) {
    this.brewPackageManager = patchInject(brewPackageManager, InjectTokens.BrewPackageManager, OsPackageManager.name);
    this.aptGetPackageManager = patchInject(
      aptGetPackageManager,
      InjectTokens.AptGetPackageManager,
      OsPackageManager.name,
    );

    if (OperatingSystem.isDarwin()) {
      this.packageManager = this.brewPackageManager;
    } else if (OperatingSystem.isLinux() || OperatingSystem.isWin32()) {
      this.packageManager = this.aptGetPackageManager;
    } else {
      throw new Error(`Unsupported OS platform: ${OperatingSystem.getPlatform()}`);
    }
  }

  public getPackageManager(): PackageManager {
    return this.packageManager;
  }
}
