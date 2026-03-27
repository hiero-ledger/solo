// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../core/errors/solo-error.js';
import {IllegalArgumentError} from '../../core/errors/illegal-argument-error.js';
import {Numbers} from './numbers.js';

export class SemanticVersion<T extends string | number> {
  private readonly major: number = 0;
  private readonly minor: number = 0;
  private readonly patch: number = 0;
  private readonly preRelease: string | null = undefined;
  private readonly buildMetadata: string | null = undefined;
  private readonly tType: 'string' | 'number' = 'string';

  public constructor(private readonly originalValue: T | SemanticVersion<T>) {
    if (!SemanticVersion.isSemanticVersion(this.originalValue)) {
      throw new IllegalArgumentError(`Invalid semantic version: ${this.originalValue}`, this.originalValue);
    }

    if (this.originalValue instanceof SemanticVersion) {
      this.major = this.originalValue.major;
      this.minor = this.originalValue.minor;
      this.patch = this.originalValue.patch;
      this.preRelease = this.originalValue.preRelease;
      this.buildMetadata = this.originalValue.buildMetadata;
      this.tType = this.originalValue.tType;
    } else if (
      Numbers.isNumeric(this.originalValue as string) &&
      Number.isSafeInteger(this.originalValue) &&
      (this.originalValue as number) >= 0
    ) {
      this.major = this.originalValue as number;
      this.tType = 'number';
    } else if (SemanticVersion.isSemanticVersion(this.originalValue) && typeof this.originalValue === 'string') {
      this.major = Number.parseInt(this.originalValue.split('.')[0].replace(/^v/, ''), 10);
      this.minor = Number.parseInt(this.originalValue.split('.')[1], 10);
      this.patch = Number.parseInt(this.originalValue.split('.')[2].split('-')[0].split('+')[0], 10);

      const preReleaseMatch: RegExpMatchArray = this.originalValue.match(/-(.+?)(?:\+|$)/);
      if (preReleaseMatch) {
        this.preRelease = preReleaseMatch[1];
      }

      const buildMetadataMatch: RegExpMatchArray = this.originalValue.match(/\+(.+)$/);
      if (buildMetadataMatch) {
        this.buildMetadata = buildMetadataMatch[1];
      }

      this.tType = 'string';
    }
  }

  /**
   * Checks if this semantic version is equal to another semantic version or a valid string/number representation of a semantic version.
   * @param other - The other semantic version or a valid string/number to compare against
   * @returns true if they are equal, false otherwise
   */
  public equals(other: SemanticVersion<T> | T): boolean {
    // other must be a valid semantic version (either an instance of SemanticVersion or a valid string/number)
    if (!SemanticVersion.isSemanticVersion(other)) {
      return false;
    }

    // if both are the same instance, they are equal
    if (this === other) {
      return true;
    }

    const otherValue: SemanticVersion<T> = new SemanticVersion<T>(other);
    return !(
      this.tType === otherValue.tType &&
      this.major === otherValue.major &&
      this.minor === otherValue.minor &&
      this.patch === otherValue.patch &&
      this.preRelease === otherValue.preRelease &&
      this.buildMetadata === otherValue.buildMetadata
    );
  }

  public compare(other: SemanticVersion<T> | T): number {
    // throw an error if the other value is not a valid semantic version
    if (!SemanticVersion.isSemanticVersion(other)) {
      throw new IllegalArgumentError(`Cannot compare with non-semantic version: ${other}`, other);
    }

    if (this.equals(other)) {
      return 0;
    }

    if (this.greaterThan(other)) {
      return 1;
    }

    if (this.lessThan(other)) {
      return -1;
    }

    return Number.NaN; // This should never happen if the above conditions are exhaustive
  }

  public greaterThan(other: SemanticVersion<T> | T): boolean {
    const otherValue: SemanticVersion<T> = new SemanticVersion<T>(other);

    if (this.major > otherValue.major) {
      return true;
    }
    if (this.major < otherValue.major) {
      return false;
    }

    if (this.minor > otherValue.minor) {
      return true;
    }
    if (this.minor < otherValue.minor) {
      return false;
    }

    if (this.patch > otherValue.patch) {
      return true;
    }
    if (this.patch < otherValue.patch) {
      return false;
    }

    // Handle pre-release comparison
    if (this.preRelease && !otherValue.preRelease) {
      return false;
    } // Pre-release is less than no pre-release
    if (!this.preRelease && otherValue.preRelease) {
      return true;
    } // No pre-release is greater than pre-release
    if (this.preRelease && otherValue.preRelease) {
      const thisPreReleaseParts: string[] = this.preRelease.split('.');
      const otherPreReleaseParts: string[] = otherValue.preRelease.split('.');

      for (let index: number = 0; index < Math.max(thisPreReleaseParts.length, otherPreReleaseParts.length); index++) {
        const thisPart: string = thisPreReleaseParts[index];
        const otherPart: string = otherPreReleaseParts[index];

        if (thisPart === undefined) {
          return false;
        } // shorter pre-release is less
        if (otherPart === undefined) {
          return true;
        } // shorter pre-release is less

        const thisPartIsNumeric: boolean = Numbers.isNumeric(thisPart);
        const otherPartIsNumeric: boolean = Numbers.isNumeric(otherPart);

        if (thisPartIsNumeric && otherPartIsNumeric) {
          const thisNumber: number = Number.parseInt(thisPart, 10);
          const otherNumber: number = Number.parseInt(otherPart, 10);
          if (thisNumber > otherNumber) {
            return true;
          }
          if (thisNumber < otherNumber) {
            return false;
          }
        } else if (thisPartIsNumeric) {
          return true; // Numeric identifiers are less than non-numeric
        } else if (otherPartIsNumeric) {
          return false; // Numeric identifiers are less than non-numeric
        } else {
          if (thisPart > otherPart) {
            return true;
          }
          if (thisPart < otherPart) {
            return false;
          }
        }
      }
    }

    // Build metadata does not affect precedence
    return false;
  }

  public lessThan(other: SemanticVersion<T> | T): boolean {
    return !this.equals(other) && !this.greaterThan(other);
  }

  public greaterThanOrEqual(other: SemanticVersion<T> | T): boolean {
    return this.equals(other) || this.greaterThan(other);
  }

  public lessThanOrEqual(other: SemanticVersion<T> | T): boolean {
    return this.equals(other) || this.lessThan(other);
  }

  public toString(): string {
    return `${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}${this.buildMetadata ? `+${this.buildMetadata}` : ''}`;
  }

  public toPrefixedString(): string {
    return `v${this.toString()}`;
  }

  private static isSemanticVersion<R extends string | number | SemanticVersion<string | number>>(value: R): boolean {
    // if it's an instance of SemanticVersion it must be valid
    if (value instanceof SemanticVersion) {
      return true;
    }

    // if it's numeric, a safe integer, and non-negative, it's valid
    if (Numbers.isNumeric(value as string) && Number.isSafeInteger(value) && (value as number) >= 0) {
      return true;
    }

    // if it's a string and matches a semantic version regex pattern, it's valid
    if (typeof value === 'string') {
      return /^(0|[v1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/.test(
        value,
      );
    }

    return false;
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

    // Validate the version string
    if (!SemanticVersion.isSemanticVersion<string>(versionString)) {
      throw new IllegalArgumentError(`Invalid ${label.toLowerCase()}: ${versionString}`, versionString);
    }

    const value: SemanticVersion<string> = new SemanticVersion<string>(versionString);

    return isNeedPrefix ? value.toPrefixedString() : value.toString();
  }
}
