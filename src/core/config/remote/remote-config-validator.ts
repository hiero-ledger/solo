// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {SoloError} from '../../errors/solo-error.js';
import {Templates} from '../../templates.js';
import {RemoteConfigValidatorApi} from './api/remote-config-validator-api.js';
import {DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {type LocalConfigRuntimeState} from '../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type Context} from '../../../types/index.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
@injectable()
export class RemoteConfigValidator implements RemoteConfigValidatorApi {
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
  }

  private static getRelayLabels(component: BaseStateSchema): string[] {
    return Templates.renderRelayLabels(component.metadata.id);
  }

  private static getHaProxyLabels(component: BaseStateSchema): string[] {
    return Templates.renderHaProxyLabels(component.metadata.id);
  }

  private static getMirrorNodeLabels(component: BaseStateSchema): string[] {
    return Templates.renderMirrorNodeLabels(component.metadata.id);
  }

  private static getEnvoyProxyLabels(component: BaseStateSchema): string[] {
    return Templates.renderEnvoyProxyLabels(component.metadata.id);
  }

  private static getExplorerLabels(component: BaseStateSchema): string[] {
    return Templates.renderExplorerLabels(component.metadata.id);
  }

  private static getConsensusNodeLabels(component: BaseStateSchema): string[] {
    return Templates.renderConsensusNodeLabels(component.metadata.id);
  }

  private static getBlockNodeLabels(component: BaseStateSchema): string[] {
    return Templates.renderBlockNodeLabels(component.metadata.id);
  }

  private static consensusNodeSkipConditionCallback(nodeComponent: ConsensusNodeStateSchema): boolean {
    return (
      nodeComponent.metadata.phase === DeploymentPhase.REQUESTED ||
      nodeComponent.metadata.phase === DeploymentPhase.STOPPED
    );
  }

  private static componentValidationsMapping: Record<
    string,
    {
      getLabelsCallback: (component: BaseStateSchema) => string[];
      displayName: string;
      skipCondition?: (component: BaseStateSchema) => boolean;
    }
  > = {
    relayNodes: {
      displayName: 'Relay Nodes',
      getLabelsCallback: RemoteConfigValidator.getRelayLabels,
    },
    haProxies: {
      displayName: 'HaProxy',
      getLabelsCallback: RemoteConfigValidator.getHaProxyLabels,
    },
    mirrorNodes: {
      displayName: 'Mirror Node',
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeLabels,
    },
    envoyProxies: {
      displayName: 'Envoy Proxy',
      getLabelsCallback: RemoteConfigValidator.getEnvoyProxyLabels,
    },
    explorers: {
      displayName: 'Explorer',
      getLabelsCallback: RemoteConfigValidator.getExplorerLabels,
    },
    consensusNodes: {
      displayName: 'Consensus Node',
      getLabelsCallback: RemoteConfigValidator.getConsensusNodeLabels,
      skipCondition: RemoteConfigValidator.consensusNodeSkipConditionCallback,
    },
    blockNodes: {
      displayName: 'Block Node',
      getLabelsCallback: RemoteConfigValidator.getBlockNodeLabels,
    },
  };

  public async validateComponents(
    namespace: NamespaceName,
    skipConsensusNodes: boolean,
    state: Readonly<DeploymentStateSchema>,
  ): Promise<void> {
    const validationPromises: Promise<void>[] = Object.entries(RemoteConfigValidator.componentValidationsMapping)
      .filter(([key]): boolean => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, {getLabelsCallback, displayName, skipCondition}]): Promise<void>[] =>
        this.validateComponentGroup(namespace, state[key], getLabelsCallback, displayName, skipCondition),
      );

    await Promise.all(validationPromises);
  }

  private validateComponentGroup(
    namespace: NamespaceName,
    components: BaseStateSchema[],
    getLabelsCallback: (component: BaseStateSchema) => string[],
    displayName: string,
    skipCondition?: (component: BaseStateSchema) => boolean,
  ): Promise<void>[] {
    return components.map(async (component): Promise<void> => {
      if (skipCondition?.(component)) {
        return;
      }

      const context: Context = this.localConfig.configuration.clusterRefs.get(component.metadata.cluster)?.toString();
      const labels: string[] = getLabelsCallback(component);

      try {
        const pods: Pod[] = await this.k8Factory.getK8(context).pods().list(namespace, labels);

        if (pods.length === 0) {
          throw new Error('Pod not found'); // to return the generic error message
        }
      } catch (error) {
        throw RemoteConfigValidator.buildValidationError(displayName, component, error);
      }
    });
  }

  /**
   * Generic handler that throws errors.
   *
   * @param displayName - name to display in error message
   * @param component - component which is not found in the cluster
   * @param error - original error for the kube client
   */
  private static buildValidationError(
    displayName: string,
    component: BaseStateSchema,
    error: Error | unknown,
  ): SoloError {
    return new SoloError(RemoteConfigValidator.buildValidationErrorMessage(displayName, component), error, component);
  }

  public static buildValidationErrorMessage(displayName: string, component: BaseStateSchema): string {
    return (
      `${displayName} in remote config with id ${component.metadata.id} was not found in ` +
      `namespace: ${component.metadata.namespace}, ` +
      `cluster: ${component.metadata.cluster}`
    );
  }
}
