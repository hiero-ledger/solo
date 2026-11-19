// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../commands/flags.js';
import {FlagValidation} from '../commands/validation/flag-validation.js';
import {type ConfigManager} from './config-manager.js';
import {type LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type Deployment} from '../business/runtime-state/config/local/deployment.js';
import {type DeploymentName, type Optional} from '../types/index.js';

export class ChainIdResolver {
  /**
   * Resolves `--chain-id` for a command that runs against an existing deployment.
   *
   * An explicit `--chain-id` wins and is written back to the local and remote config, so a deployment created before
   * the chain ID was stored gets one. Otherwise the deployment's stored chain ID is used, preferring the remote config
   * over the local one, and the flag default when neither holds one.
   *
   * @param configManager - tells an explicit `--chain-id` apart from its default
   * @param localConfig - a loaded local config holding the deployment
   * @param remoteConfig - the deployment's remote config; read and written only when loaded
   * @param deploymentName - the deployment the command runs against
   * @returns the chain ID in decimal, the only form the consensus node parses for `contracts.chainId`
   */
  public static async resolve(
    configManager: ConfigManager,
    localConfig: LocalConfigRuntimeState,
    remoteConfig: RemoteConfigRuntimeStateApi,
    deploymentName: DeploymentName,
  ): Promise<string> {
    const deployment: Optional<Deployment> = localConfig.configuration.deployments.find(
      (candidate: Deployment): boolean => candidate.name === deploymentName,
    );
    const isRemoteConfigLoaded: boolean = remoteConfig.isLoaded();

    if (!configManager.wasFlagProvidedByUser(flags.chainId)) {
      const storedChainId: Optional<number> =
        (isRemoteConfigLoaded ? remoteConfig.configuration.ledger?.chainId : undefined) ?? deployment?.chainId;

      return String(
        storedChainId ?? FlagValidation.validatedNumber(flags.chainId, flags.chainId.definition.defaultValue as string),
      );
    }

    const chainId: number = FlagValidation.validatedNumber(flags.chainId, configManager.getFlag<string>(flags.chainId));

    if (deployment && deployment.chainId !== chainId) {
      deployment.chainId = chainId;
      await localConfig.persist();
    }

    if (
      isRemoteConfigLoaded &&
      remoteConfig.configuration.ledger &&
      remoteConfig.configuration.ledger.chainId !== chainId
    ) {
      remoteConfig.configuration.ledger.chainId = chainId;
      await remoteConfig.persist();
    }

    return String(chainId);
  }
}
