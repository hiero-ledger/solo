// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the Kubernetes API returns an incorrect or unexpected response. solo expects well-formed
 * responses from the API, so this means a call returned something it could not interpret — for example a
 * malformed or partial response, often indicating an API server problem.
 */
export class KubernetesApiInvalidResponseSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  // TODO(config-checks #8 — preserve the original cause): this constructor takes no arguments, so
  //   callers (e.g. remote-config getConfigMap) cannot chain the underlying kube error. Add a
  //   `cause` parameter and pass it through to SoloError so logs show the real reason. Pure
  //   improvement, no decision. See docs/design/architecture/system/config-checks-to-add.md
  public constructor() {
    super({
      message: 'Received an incorrect or unexpected response from the Kubernetes API',
      code: ErrorCodeRegistry.KUBERNETES_API_INVALID_RESPONSE,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify Kubernetes API server is reachable: kubectl cluster-info\n' +
        'Check kubeconfig context: kubectl config current-context\n' +
        'Inspect Kubernetes API server health',
    });
  }
}
