// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../constants.js';
import {SoloError} from '../../errors/solo-error.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type LocalConfigRuntimeState} from '../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type Context} from '../../../types/index.js';
import {type NodeAlias} from '../../../types/aliases.js';
import {Templates} from '../../templates.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {RemoteConfigValidatorApi} from './api/remote-config-validator-api.js';
import {DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {ExplorerStateSchema} from '../../../data/schema/model/remote/state/explorer-state-schema.js';
import {SemVer} from 'semver';
import {EXPLORER_OLD_VERSION_BEFORE_LABEL_CHANGE} from '../../../../version.js';
import {type RelayNodeStateSchema} from '../../../data/schema/model/remote/state/relay-node-state-schema.js';

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
    // TODO:
    //  https://github.com/hashgraph/solo/issues/1823
    //  Add logic for selecting by specific label,
    //  when multiple instances can be deployed at the same time.
    const relayComponent = component as RelayNodeStateSchema;
    const ids: number[] = relayComponent.consensusNodeIds;
    // generate label such as relay-node1 or relay-node1-node2
    let label: string = 'relay';
    for (const id of ids) {
      label += `-${Templates.renderNodeAliasFromNumber(id + 1)}`;
    }
    return [`app.kubernetes.io/instance=${label}`];
  }

  private static getHaProxyLabels(component: BaseStateSchema): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(component.metadata.id + 1);
    return [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'];
  }

  private static getMirrorNodeLabels(): string[] {
    // TODO:
    //  https://github.com/hashgraph/solo/issues/1823
    //  Add logic for selecting by specific label,
    //  when multiple instances can be deployed at the same time.
    return ['app.kubernetes.io/component=importer', 'app.kubernetes.io/name=importer'];
  }

  private static getEnvoyProxyLabels(component: BaseStateSchema): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(component.metadata.id + 1);
    return [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=envoy-proxy'];
  }

  private static getMirrorNodeExplorerLabels(): string[] {
    // TODO:
    //  https://github.com/hashgraph/solo/issues/1823
    //  Add logic for selecting by specific label,
    //  when multiple instances can be deployed at the same time.
    return [constants.SOLO_EXPLORER_LABEL];
  }

  private static getConsensusNodeLabels(component: BaseStateSchema): string[] {
    return [`app=network-${Templates.renderNodeAliasFromNumber(component.metadata.id + 1)}`];
  }

  private static consensusNodeSkipConditionCallback(nodeComponent: ConsensusNodeStateSchema): boolean {
    return (
      nodeComponent.metadata.phase === DeploymentPhase.REQUESTED ||
      nodeComponent.metadata.phase === DeploymentPhase.STOPPED
    );
  }

  private static getBlockNodeLabels(): string[] {
    return [`app.kubernetes.io/name=${constants.BLOCK_NODE_RELEASE_NAME}-0`];
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
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeExplorerLabels,
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
      .filter(([key]) => key !== 'consensusNodes' || !skipConsensusNodes)
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

      let labels: string[] = getLabelsCallback(component);

      // special handling of explorer scheme since its label changed
      if (component instanceof ExplorerStateSchema && component.version) {
        const chartVersion: SemVer = new SemVer(component.version);
        const oldVersion: SemVer = new SemVer(EXPLORER_OLD_VERSION_BEFORE_LABEL_CHANGE);
        if (chartVersion.compare(oldVersion) <= 0) {
          labels = [constants.OLD_SOLO_EXPLORER_LABEL];
        }
      }

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
