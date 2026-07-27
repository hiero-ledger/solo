// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when several clusters are available but none was selected; the message lists them. solo cannot
 * guess which cluster to use, so it asks you to disambiguate with `--cluster-ref`.
 */
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
