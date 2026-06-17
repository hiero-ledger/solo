// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeContainerOperationFailedError extends KubeError {
  public readonly operation: string;

  public constructor(operation: string, cause?: Error | unknown) {
    const causeMessage: string = cause instanceof Error ? cause.message : String(cause ?? '');
    super(
      `Container operation '${operation}' failed${causeMessage ? `: ${causeMessage}` : ''}`,
      cause instanceof Error ? cause : undefined,
      {operation},
    );
    this.operation = operation;
  }
}
