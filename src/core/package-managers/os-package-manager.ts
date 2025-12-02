// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {PackageManager} from './package-manager.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {BrewPackageManager} from './brew-package-manager.js';
import {AptGetPackageManager} from './apt-get-package-manager.js';
import * as constants from '../constants.js';

@injectable()
export class OsPackageManager {
  protected packageManager: PackageManager;

  public constructor(
    @inject(InjectTokens.BrewPackageManager) protected readonly brewPackageManager: BrewPackageManager,
    @inject(InjectTokens.AptGetPackageManager) protected readonly aptGetPackageManager: AptGetPackageManager,
    @inject(InjectTokens.OsPlatform) protected readonly osPlatform: NodeJS.Platform,
  ) {
    this.brewPackageManager = patchInject(brewPackageManager, InjectTokens.BrewPackageManager, OsPackageManager.name);
    this.aptGetPackageManager = patchInject(
      aptGetPackageManager,
      InjectTokens.AptGetPackageManager,
      OsPackageManager.name,
    );
    this.osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, OsPackageManager.name);

    switch (this.osPlatform) {
      case constants.OS_DARWIN: {
        this.packageManager = this.brewPackageManager;
        break;
      }
      case constants.OS_LINUX:
      case constants.OS_WIN32: {
        this.packageManager = this.aptGetPackageManager;
        break;
      }
      default: {
        throw new Error(`Unsupported OS platform: ${this.osPlatform}`);
      }
    }
  }

  public getPackageManager(): PackageManager {
    return this.packageManager;
  }
}
