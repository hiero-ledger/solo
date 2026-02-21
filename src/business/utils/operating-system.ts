// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';

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
    return OperatingSystem.getPlatform() === OperatingSystem.OS_WIN32;
  }

  /**
   * Returns true if the Node.js `process.platform` is linux, false otherwise.
   */
  public static isLinux(): boolean {
    return OperatingSystem.getPlatform() === OperatingSystem.OS_LINUX;
  }

  /**
   * Returns true if the Node.js `process.platform` is darwin, false otherwise.
   */
  public static isDarwin(): boolean {
    return OperatingSystem.getPlatform() === OperatingSystem.OS_DARWIN;
  }

  /**
   * Returns the current Node.js `process.platform` value as a string.
   * This should only be used for logging or error messages to indicate the detected platform.
   */
  public static getPlatform(): string {
    return container.resolve<string>(InjectTokens.OsPlatform);
  }

  /**
   * Returns a formatted platform string for use in constructing download URLs or file paths.
   * For Windows, it returns 'windows' instead of 'win32' to match common naming conventions in download URLs.
   * For other platforms, it returns the original `process.platform` value.
   */
  public static getFormattedPlatform(): string {
    return this.isWin32() ? 'windows' : OperatingSystem.getPlatform();
  }
}
