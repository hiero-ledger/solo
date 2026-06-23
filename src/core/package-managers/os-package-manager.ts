// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import fs from 'node:fs';
import path from 'node:path';
import {type PackageManager} from './package-manager.js';
import {LinuxPackageManagerType} from './linux-package-manager-type.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {BrewPackageManager} from './brew-package-manager.js';
import {AptGetPackageManager} from './apt-get-package-manager.js';
import {DnfPackageManager} from './dnf-package-manager.js';
import {ZypperPackageManager} from './zypper-package-manager.js';
import {PacmanPackageManager} from './pacman-package-manager.js';
import {ApkPackageManager} from './apk-package-manager.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {SoloErrors} from '../errors/solo-errors.js';

/**
 * Selects the correct {@link PackageManager} for the host operating system and — on Linux — for the
 * specific distribution, so callers can install system dependencies without knowing which package
 * manager the user is running.
 */
@injectable()
export class OsPackageManager {
  /** Maps an os-release identifier (an `ID` or an `ID_LIKE` token) to the package manager it ships. */
  private static readonly DISTRIBUTION_PACKAGE_MANAGERS: Record<string, LinuxPackageManagerType> = {
    debian: LinuxPackageManagerType.APT_GET,
    ubuntu: LinuxPackageManagerType.APT_GET,
    fedora: LinuxPackageManagerType.DNF,
    rhel: LinuxPackageManagerType.DNF,
    centos: LinuxPackageManagerType.DNF,
    suse: LinuxPackageManagerType.ZYPPER,
    opensuse: LinuxPackageManagerType.ZYPPER,
    sles: LinuxPackageManagerType.ZYPPER,
    arch: LinuxPackageManagerType.PACMAN,
    alpine: LinuxPackageManagerType.APK,
  };

  /** Priority order used when falling back to probing which package-manager binary is installed. */
  private static readonly FALLBACK_PROBE_ORDER: LinuxPackageManagerType[] = [
    LinuxPackageManagerType.APT_GET,
    LinuxPackageManagerType.DNF,
    LinuxPackageManagerType.ZYPPER,
    LinuxPackageManagerType.PACMAN,
    LinuxPackageManagerType.APK,
  ];

  protected packageManager: PackageManager;

  public constructor(
    @inject(InjectTokens.BrewPackageManager) protected readonly brewPackageManager: BrewPackageManager,
    @inject(InjectTokens.AptGetPackageManager) protected readonly aptGetPackageManager: AptGetPackageManager,
    @inject(InjectTokens.DnfPackageManager) protected readonly dnfPackageManager: DnfPackageManager,
    @inject(InjectTokens.ZypperPackageManager) protected readonly zypperPackageManager: ZypperPackageManager,
    @inject(InjectTokens.PacmanPackageManager) protected readonly pacmanPackageManager: PacmanPackageManager,
    @inject(InjectTokens.ApkPackageManager) protected readonly apkPackageManager: ApkPackageManager,
  ) {
    this.brewPackageManager = patchInject(brewPackageManager, InjectTokens.BrewPackageManager, OsPackageManager.name);
    this.aptGetPackageManager = patchInject(
      aptGetPackageManager,
      InjectTokens.AptGetPackageManager,
      OsPackageManager.name,
    );
    this.dnfPackageManager = patchInject(dnfPackageManager, InjectTokens.DnfPackageManager, OsPackageManager.name);
    this.zypperPackageManager = patchInject(
      zypperPackageManager,
      InjectTokens.ZypperPackageManager,
      OsPackageManager.name,
    );
    this.pacmanPackageManager = patchInject(
      pacmanPackageManager,
      InjectTokens.PacmanPackageManager,
      OsPackageManager.name,
    );
    this.apkPackageManager = patchInject(apkPackageManager, InjectTokens.ApkPackageManager, OsPackageManager.name);

    if (OperatingSystem.isDarwin()) {
      this.packageManager = this.brewPackageManager;
    } else if (OperatingSystem.isWin32()) {
      // On Windows, Solo runs its Linux install flow inside WSL2 (Ubuntu), which uses apt-get.
      this.packageManager = this.aptGetPackageManager;
    } else if (OperatingSystem.isLinux()) {
      this.packageManager = this.resolveLinuxPackageManager();
    } else {
      throw new Error(`Unsupported OS platform: ${OperatingSystem.getPlatform()}`);
    }
  }

  public getPackageManager(): PackageManager {
    return this.packageManager;
  }

  /** Resolves the package manager for the current Linux distribution via /etc/os-release, with a binary probe fallback. */
  private resolveLinuxPackageManager(): PackageManager {
    const osRelease: {id: string; idLike: string[]} = OsPackageManager.readOsRelease();
    const candidates: string[] = [osRelease.id, ...osRelease.idLike].filter(Boolean);

    for (const candidate of candidates) {
      const type: LinuxPackageManagerType | undefined = OsPackageManager.DISTRIBUTION_PACKAGE_MANAGERS[candidate];
      if (type) {
        return this.getManagerByType(type);
      }
    }

    // os-release did not identify a known distribution; fall back to probing for an installed binary.
    for (const type of OsPackageManager.FALLBACK_PROBE_ORDER) {
      if (OsPackageManager.isCommandAvailable(type)) {
        return this.getManagerByType(type);
      }
    }

    throw new SoloErrors.system.unsupportedLinuxDistribution(osRelease.id);
  }

  private getManagerByType(type: LinuxPackageManagerType): PackageManager {
    const managers: Record<LinuxPackageManagerType, PackageManager> = {
      [LinuxPackageManagerType.APT_GET]: this.aptGetPackageManager,
      [LinuxPackageManagerType.DNF]: this.dnfPackageManager,
      [LinuxPackageManagerType.ZYPPER]: this.zypperPackageManager,
      [LinuxPackageManagerType.PACMAN]: this.pacmanPackageManager,
      [LinuxPackageManagerType.APK]: this.apkPackageManager,
    };
    return managers[type];
  }

  /** Reads and parses `ID` and `ID_LIKE` from `/etc/os-release`; returns empty values when unavailable. */
  private static readOsRelease(): {id: string; idLike: string[]} {
    try {
      const content: string = fs.readFileSync('/etc/os-release', 'utf8');
      let id: string = '';
      let idLike: string[] = [];
      for (const rawLine of content.split('\n')) {
        const line: string = rawLine.trim();
        if (line.startsWith('ID=')) {
          id = OsPackageManager.unquote(line.slice('ID='.length));
        } else if (line.startsWith('ID_LIKE=')) {
          idLike = OsPackageManager.unquote(line.slice('ID_LIKE='.length)).split(/\s+/).filter(Boolean);
        }
      }
      return {id, idLike};
    } catch {
      return {id: '', idLike: []};
    }
  }

  private static unquote(value: string): string {
    return value
      .trim()
      .replaceAll(/^["']|["']$/g, '')
      .toLowerCase();
  }

  /** Returns true if the given executable is found on the PATH (synchronous, no subprocess). */
  private static isCommandAvailable(command: string): boolean {
    const pathValue: string = process.env.PATH ?? '';
    return pathValue.split(path.delimiter).some((directory: string): boolean => {
      try {
        fs.accessSync(path.join(directory, command), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }
}
