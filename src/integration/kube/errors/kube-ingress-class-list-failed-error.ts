// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeIngressClassListFailedError extends KubeError {
  public constructor(cause: Error | unknown) {
    const causeError: Error | undefined = cause instanceof Error ? cause : undefined;
    const causeMessage: string = cause instanceof Error ? cause.message : String(cause ?? '');
    super(`Failed to list Kubernetes IngressClasses: ${causeMessage}`, causeError);
  }
}
