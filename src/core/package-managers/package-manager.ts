// SPDX-License-Identifier: Apache-2.0

import {
  type ExternalCommandExecutionOptions,
  type ExternalCommandInvocation,
} from '../execution/external-command-invocation.js';

export interface PackageManager {
  installPackages(dependencies: string[]): Promise<void>;
  uninstallPackages(dependencies: string[]): Promise<void>;
  upgrade(dependencies: string[]): Promise<void>;
  update(): Promise<void>;
  install(): Promise<boolean>;
  uninstall(): Promise<void>;
  isAvailable(): Promise<boolean>;
  runExternalCommand(
    invocation: ExternalCommandInvocation,
    options?: ExternalCommandExecutionOptions,
  ): Promise<string[]>;
}
