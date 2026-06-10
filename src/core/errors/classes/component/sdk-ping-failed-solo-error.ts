// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class SdkPingFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, maxRetries: number, cause?: Error) {
    super(
      {
        message: `SDK ping to network node ${nodeAlias} failed after ${maxRetries} retries`,
        code: ErrorCodeRegistry.SDK_PING_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the node pod is running: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=${nodeAlias}\n` +
          'Inspect node logs: kubectl logs <node-pod> -n <namespace>\n' +
          'Check port-forward status: solo deployment refresh port-forwards\n' +
          'Restart the node: solo consensus node restart',
      },
      cause,
    );
  }
}
