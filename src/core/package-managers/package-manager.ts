// SPDX-License-Identifier: Apache-2.0

export interface PackageManager {
  installPackages(dependencies: string[]): Promise<void>;
  uninstallPackages(dependencies: string[]): Promise<void>;
  upgrade(dependencies: string[]): Promise<void>;
  update(): Promise<void>;
  install(): Promise<boolean>;
  uninstall(): Promise<void>;
  isAvailable(): Promise<boolean>;
  runCommand(
    cmd: string,
    arguments_?: string[],
    verbose?: boolean,
    detached?: boolean,
    environmentVariablesToAppend?: Record<string, string>,
    timeoutMs?: number,
    cwd?: string,
  ): Promise<string[]>;
}
