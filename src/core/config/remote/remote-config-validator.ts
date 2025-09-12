// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {SoloError} from '../../errors/solo-error.js';
import {Templates} from '../../templates.js';
import {RemoteConfigValidatorApi} from './api/remote-config-validator-api.js';
import {DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {type LocalConfigRuntimeState} from '../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type ChartManager} from '../../chart-manager.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type ComponentId, type Context} from '../../../types/index.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import * as constants from '../../constants.js';
import {NodeAlias, NodeAliases} from '../../../types/aliases.js';
import {RelayNodeStateSchema} from '../../../data/schema/model/remote/state/relay-node-state-schema.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
@injectable()
export class RemoteConfigValidator implements RemoteConfigValidatorApi {
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.ChartManager) private readonly chartManager?: ChartManager,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
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
      getLabelsCallback: (id: ComponentId, legacyReleaseName?: string) => string[];
      displayName: string;
      skipCondition?: (component: BaseStateSchema) => boolean;
      legacyReleaseName?: string;
    }
  > = {
    relayNodes: {
      displayName: 'Relay Nodes',
      getLabelsCallback: Templates.renderRelayLabels,
      legacyReleaseName: constants.JSON_RPC_RELAY_RELEASE_NAME,
    },
    haProxies: {
      displayName: 'HaProxy',
      getLabelsCallback: Templates.renderHaProxyLabels,
    },
    mirrorNodes: {
      displayName: 'Mirror Node',
      getLabelsCallback: Templates.renderMirrorNodeLabels,
      legacyReleaseName: constants.MIRROR_NODE_RELEASE_NAME,
    },
    envoyProxies: {
      displayName: 'Envoy Proxy',
      getLabelsCallback: Templates.renderEnvoyProxyLabels,
    },
    explorers: {
      displayName: 'Explorer',
      getLabelsCallback: Templates.renderExplorerLabels,
      legacyReleaseName: 'hiero-explorer',
    },
    consensusNodes: {
      displayName: 'Consensus Node',
      getLabelsCallback: Templates.renderConsensusNodeLabels,
      skipCondition: RemoteConfigValidator.consensusNodeSkipConditionCallback,
    },
    blockNodes: {
      displayName: 'Block Node',
      getLabelsCallback: Templates.renderBlockNodeLabels,
      legacyReleaseName: `${constants.BLOCK_NODE_RELEASE_NAME}-0`,
    },
  };

  public async validateComponents(
    namespace: NamespaceName,
    skipConsensusNodes: boolean,
    state: Readonly<DeploymentStateSchema>,
  ): Promise<void> {
    const validationPromises: Promise<void>[] = Object.entries(RemoteConfigValidator.componentValidationsMapping)
      .filter(([key]): boolean => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, {getLabelsCallback, displayName, skipCondition, legacyReleaseName}]): Promise<void>[] =>
        this.validateComponentGroup(
          key,
          namespace,
          state[key],
          getLabelsCallback,
          displayName,
          skipCondition,
          legacyReleaseName,
        ),
      );

    await Promise.all(validationPromises);
  }

  private validateComponentGroup(
    key: string,
    namespace: NamespaceName,
    components: BaseStateSchema[],
    getLabelsCallback: (id: ComponentId, legacyReleaseName?: string) => string[],
    displayName: string,
    skipCondition?: (component: BaseStateSchema) => boolean,
    legacyReleaseName?: string,
  ): Promise<void>[] {
    return components.map(async (component): Promise<void> => {
      if (skipCondition?.(component)) {
        return;
      }

      const context: Context = this.localConfig.configuration.clusterRefs.get(component.metadata.cluster)?.toString();

      let useLegacyReleaseName: boolean = false;
      if (legacyReleaseName && component.metadata.id <= 1) {
        if (key === 'relayNodes') {
          const nodeAliases: NodeAliases = (component as RelayNodeStateSchema)?.consensusNodeIds.map(
            (nodeId): NodeAlias => Templates.renderNodeAliasFromNumber(nodeId + 1),
          );

          legacyReleaseName = `${legacyReleaseName}-${nodeAliases.join('-')}`;
        }

        const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
          namespace,
          legacyReleaseName,
          context,
        );

        if (isLegacyChartInstalled) {
          useLegacyReleaseName = true;
        }
      }

      const labels: string[] = useLegacyReleaseName
        ? getLabelsCallback(component.metadata.id, legacyReleaseName)
        : getLabelsCallback(component.metadata.id);

      try {
        const pods: Pod[] = await this.k8Factory.getK8(context).pods().list(namespace, labels);

        if (pods.length === 0) {
          throw new Error('Pod not found'); // to return the generic error message
        }
      } catch (error) {
        throw RemoteConfigValidator.buildValidationError(displayName, component, error, labels);
      }
    });
  }

  /**
   * Generic handler that throws errors.
   *
   * @param displayName - name to display in error message
   * @param component - component which is not found in the cluster
   * @param error - original error for the kube client
   * @param labels - labels used to find the component
   */
  private static buildValidationError(
    displayName: string,
    component: BaseStateSchema,
    error: Error | unknown,
    labels?: string[],
  ): SoloError {
    return new SoloError(
      RemoteConfigValidator.buildValidationErrorMessage(displayName, component, labels),
      error,
      component,
    );
  }

  public static buildValidationErrorMessage(
    displayName: string,
    component: BaseStateSchema,
    labels: string[] = [],
  ): string {
    let message: string =
      `${displayName} in remote config with id ${component.metadata.id} was not found in ` +
      `namespace: ${component.metadata.namespace}, ` +
      `cluster: ${component.metadata.cluster}`;

    if (labels?.length !== 0) {
      message += `,    labels: ${labels}`;
    }

    return message;
  }
}
