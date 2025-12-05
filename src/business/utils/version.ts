// SPDX-License-Identifier: Apache-2.0

import {SemVer} from 'semver';
import * as semver from 'semver';
import {SoloError} from '../../core/errors/solo-error.js';
import {IllegalArgumentError} from '../../core/errors/illegal-argument-error.js';

export class Version<T extends SemVer | number> {
  public constructor(public readonly value: T) {
    if (!Version.isNumeric(value) && (!value || !Version.isSemVer(value))) {
      throw new RangeError('Invalid version');
    }

    if (Version.isNumeric(value) && (!Number.isSafeInteger(value) || (value as number) < 0)) {
      throw new RangeError('Invalid version');
    }
  }

  public equals(other: Version<T>): boolean {
    if (Version.isSemVer(this.value) && Version.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer) === 0;
    }

    if (Version.isNumeric(this.value) && Version.isNumeric(other.value)) {
      return this.value === other.value;
    }

    return false;
  }

  public compare(other: Version<T>): number {
    if (Version.isSemVer(this.value) && Version.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer);
    }

    if (Version.isNumeric(this.value) && Version.isNumeric(other.value)) {
      if (this.value < other.value) {
        return -1;
      } else if (this.value > other.value) {
        return 1;
      }
      return 0;
    }

    return Number.NaN;
  }

  public toString(): string {
    return this.value.toString();
  }

  private static isSemVer<R extends SemVer | number>(v: R): boolean {
    return v instanceof SemVer;
  }

  private static isNumeric<R extends SemVer | number>(v: R): boolean {
    return Number.isSafeInteger(v) && !Number.isNaN(v);
  }
  /**
   * Validates if a string is a valid semantic version and handles the 'v' prefix
   *
   * @param versionString - The version string to validate
   * @param isNeedPrefix - If true, adds 'v' prefix if missing; if false, removes 'v' prefix if present
   * @param label - Label to use in error messages (e.g., 'Release tag', 'Version')
   * @returns The processed version string with proper prefix handling
   * @throws SoloError or IllegalArgumentError if the version string is invalid
   */
  public static getValidSemanticVersion(
    versionString: string,
    isNeedPrefix: boolean = false,
    label: string = 'Version',
  ): string {
    if (!versionString) {
      throw new SoloError(`${label} cannot be empty`);
    }

    // Handle 'v' prefix based on isNeedPrefix parameter
    let processedVersion: string = versionString;
    if (isNeedPrefix && !versionString.startsWith('v')) {
      processedVersion = `v${versionString}`;
    } else if (!isNeedPrefix && versionString.startsWith('v')) {
      processedVersion = versionString.slice(1);
    }

    // Validate the version string
    if (!semver.valid(processedVersion)) {
      throw new IllegalArgumentError(`Invalid ${label.toLowerCase()}: ${versionString}`, versionString);
    }

    return processedVersion;
  }
}
