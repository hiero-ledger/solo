// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MultipleClustersFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterList: string) {
    super({
      message: `Multiple clusters found (${clusterList}). Please specify --cluster-ref to select one.`,
      code: ErrorCodeRegistry.MULTIPLE_CLUSTERS_FOUND,
      troubleshootingSteps:
        'Specify the cluster reference using the --cluster-ref flag\n' +
        'List available cluster references: solo cluster-ref config list',
    });
  }
}
