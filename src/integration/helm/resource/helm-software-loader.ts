// SPDX-License-Identifier: Apache-2.0

import {HelmConfigurationException} from '../helm-configuration-exception.js';
import {ShellRunner} from '../../../core/shell-runner.js';
import {OperatingSystem} from '../../../business/utils/operating-system.js';

/**
 * Get helm executable path
 */
export class HelmSoftwareLoader {
  public static async getHelmExecutablePath(): Promise<string> {
    try {
      const shellRunner: ShellRunner = new ShellRunner();

      let helmPath: string;
      // Use the appropriate command based on the platform
      if (OperatingSystem.isLinux() || OperatingSystem.isDarwin()) {
        // eslint-disable-next-line unicorn/no-await-expression-member
        helmPath = (await shellRunner.run('which helm')).join('').trim();
      } else if (OperatingSystem.isWin32()) {
        // eslint-disable-next-line unicorn/no-await-expression-member
        helmPath = (await shellRunner.run('where helm')).join('').trim();
      } else {
        throw new HelmConfigurationException(`Unsupported operating system: ${OperatingSystem.getPlatform()}`);
      }

      if (!helmPath) {
        throw new HelmConfigurationException(
          'Helm executable not found in PATH. Please install Helm and ensure it is available in your system PATH.',
        );
      }

      return helmPath;
    } catch (error) {
      if (error instanceof HelmConfigurationException) {
        throw error;
      }
      throw new HelmConfigurationException(`Failed to locate Helm executable: ${(error as Error).message}`);
    }
  }
}
