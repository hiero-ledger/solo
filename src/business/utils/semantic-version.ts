// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../core/errors/solo-error.js';
import {IllegalArgumentError} from '../../core/errors/illegal-argument-error.js';
import {Numbers} from './numbers.js';

export class SemanticVersion {
  public constructor(private readonly originalValue: string | number | SemanticVersion) {
    if (!Numbers.isNumeric(originalValue as string) && (!originalValue || !SemanticVersion.isSemVer(originalValue))) {
      throw new RangeError('Invalid version');
    }

    if (
      Numbers.isNumeric(originalValue as string) &&
      (!Number.isSafeInteger(originalValue) || (originalValue as number) < 0)
    ) {
      throw new RangeError('Invalid version');
    }
  }

  public equals(other: SemanticVersion<T>): boolean {
    if (SemanticVersion.isSemVer(this.value) && SemanticVersion.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer) === 0;
    }

    if (Numbers.isNumeric(this.value) && Numbers.isNumeric(other.value)) {
      return this.value === other.value;
    }

    return false;
  }

  public compare(other: SemanticVersion<T>): number {
    if (SemanticVersion.isSemVer(this.value) && SemanticVersion.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer);
    }

    if (Numbers.isNumeric(this.value) && Numbers.isNumeric(other.value)) {
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
   * @param label - Label to use in error messages (e.g., 'Release tag', 'SemanticVersion')
   * @returns The processed version string with proper prefix handling
   * @throws SoloError or IllegalArgumentError if the version string is invalid
   */
  public static getValidSemanticVersion(
    versionString: string,
    isNeedPrefix: boolean = false,
    label: string = 'SemanticVersion',
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
