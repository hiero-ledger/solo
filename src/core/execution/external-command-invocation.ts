// SPDX-License-Identifier: Apache-2.0

export type ExternalCommandArgument = string;

/**
 * Represents a command executed outside of Solo through a direct executable invocation.
 *
 * Arguments must be provided as individual tokens and are not interpreted by a shell.
 */
export interface ExternalCommandInvocation {
  commandPathOrName: string;
  commandArguments: ExternalCommandArgument[];
  environmentVariables?: Record<string, string>;
  workingDirectory?: string;
}

export interface ExternalCommandExecutionOptions {
  verbose?: boolean;
  detached?: boolean;
  timeoutMs?: number;
}
