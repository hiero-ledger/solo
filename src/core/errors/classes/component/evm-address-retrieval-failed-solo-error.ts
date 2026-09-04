// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot determine the EVM address associated with a Hedera account; the message names the
 * account. solo derives or looks up the account EVM (alias) address for EVM-compatible workflows, so this
 * is raised when that lookup fails — for example the account has no EVM address, or its account info could
 * not be retrieved from the network.
 */
export class EvmAddressRetrievalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: string) {
    super({
      message: `Failed to retrieve EVM address for account ${accountId}`,
      code: ErrorCodeRegistry.EVM_ADDRESS_RETRIEVAL_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Verify the account ID is valid and the account exists on the network',
    });
  }
}
