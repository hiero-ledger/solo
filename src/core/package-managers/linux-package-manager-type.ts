// SPDX-License-Identifier: Apache-2.0

/**
 * Identifies which native Linux package manager Solo should use for a given distribution.
 */
export enum LinuxPackageManagerType {
  APT_GET = 'apt-get',
  DNF = 'dnf',
  YUM = 'yum',
  ZYPPER = 'zypper',
  PACMAN = 'pacman',
  APK = 'apk',
}
