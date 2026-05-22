// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class GrpcEndpointsRequiredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(endpointType: string) {
    super({
      message: `${Flags.getFormattedFlagKey(Flags.grpcEndpoints)} must be set if ${Flags.getFormattedFlagKey(Flags.endpointType)} is: ${endpointType}`,
      code: ErrorCodeRegistry.GRPC_ENDPOINTS_REQUIRED,
      troubleshootingSteps:
        `Provide gRPC endpoints: solo ${ConsensusCommandDefinition.ADD_COMMAND} ${Flags.getFormattedFlagKey(Flags.grpcEndpoints)} <ip:port,...>\n` +
        `Or switch endpoint type: solo ${ConsensusCommandDefinition.ADD_COMMAND} ${Flags.getFormattedFlagKey(Flags.endpointType)} FQDN\n` +
        `Review flag usage: solo ${ConsensusCommandDefinition.ADD_COMMAND} --help`,
    });
  }
}
