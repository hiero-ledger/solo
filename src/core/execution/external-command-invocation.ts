// SPDX-License-Identifier: Apache-2.0

export interface ExternalCommandInvocation {
  commandPathOrName: string;
  commandArguments: string[];
  environmentVariables?: Record<string, string>;
  workingDirectory?: string;
}
