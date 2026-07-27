// SPDX-License-Identifier: Apache-2.0

import {type ShellRunOptions} from '../shell-run-options.js';

export interface PackageManager {
  installPackages(dependencies: string[]): Promise<void>;
  uninstallPackages(dependencies: string[]): Promise<void>;
  upgrade(dependencies: string[]): Promise<void>;
  update(): Promise<void>;
  install(): Promise<boolean>;
  uninstall(): Promise<void>;
  isAvailable(): Promise<boolean>;
  setOnSudoRequested(callback: (message: string) => void): void;
  setOnSudoGranted(callback: (message: string) => void): void;
  run(cmd: string, arguments_?: string[], options?: ShellRunOptions): Promise<string[]>;
}
