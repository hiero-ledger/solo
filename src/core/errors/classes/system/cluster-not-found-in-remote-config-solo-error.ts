// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterNotFoundInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `Cluster ${clusterReference} not found in remote config`,
      code: ErrorCodeRegistry.CLUSTER_NOT_FOUND_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'List configured cluster references: solo cluster-ref list\n' +
        `Inspect the remote config to see which clusters block nodes reference: kubectl get configmap solo-remote-config -n <namespace> -o yaml\n` +
        'If the cluster was renamed or removed, the deployment config may need to be repaired',
    });
  }
}
