// SPDX-License-Identifier: Apache-2.0

import {platform} from 'node:process';

/**
 * Utility class for determining the operating system platform.
 * Provides methods to check if the current OS is Windows, Linux, or macOS.
 */
export class OperatingSystem {
  public static OS_WIN32: string = 'win32';
  public static OS_DARWIN: string = 'darwin';
  public static OS_LINUX: string = 'linux';

  /**
   * Returns true if the Node.js `process.platform` is win32, false otherwise.
   */
  public static isWin32(): boolean {
    return platform === OperatingSystem.OS_WIN32;
  }

  /**
   * Returns true if the Node.js `process.platform` is linux, false otherwise.
   */
  public static isLinux(): boolean {
    return platform === OperatingSystem.OS_LINUX;
  }

  /**
   * Returns true if the Node.js `process.platform` is darwin, false otherwise.
   */
  public static isDarwin(): boolean {
    return platform === OperatingSystem.OS_DARWIN;
  }

  /**
   * Returns the current Node.js `process.platform` value as a string.
   * This should only be used for logging or error messages to indicate the detected platform.
   */
  public static getPlatform(): string {
    return platform;
  }

  /**
   * Returns a formatted platform string for use in constructing download URLs or file paths.
   * For Windows, it returns 'windows' instead of 'win32' to match common naming conventions in download URLs.
   * For other platforms, it returns the original `process.platform` value.
   */
  public static getFormattedPlatform(): string {
    return this.isWin32() ? 'windows' : platform;
  }
}
