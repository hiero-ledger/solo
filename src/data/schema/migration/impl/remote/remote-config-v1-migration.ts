// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';
import {getSoloVersion} from '../../../../../../version.js';
import {Templates} from '../../../../../core/templates.js';
import {type NodeAlias} from '../../../../../types/aliases.js';

export class RemoteConfigV1Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(0);
  }

  public get version(): Version<number> {
    return new Version(1);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: any = structuredClone(source);

    if (clone.schemaVersion && clone.schemaVersion !== 0) {
      // this case should never happen considering the field was not present in version 0 and should default to zero
      // during this migration
      throw new InvalidSchemaVersionError(clone.schemaVersion, 0);
    }

    // Initialize metadata if it doesn't exist
    if (!clone.metadata) {
      clone.metadata = {};
    }

    // remove old typo property
    delete clone.metadata.lastUpdateBy; // changed to lastUpdatedBy

    // Preserve the original metadata and add lastUpdated information
    const originalMetadata: any = clone.metadata;
    clone.metadata = {
      ...originalMetadata,
      lastUpdatedAt: new Date(),
      lastUpdatedBy: {
        name: 'system',
        hostname: 'migration',
      },
    };

    // pull the versions from the old config, if it isn't set or set as empty,
    // then it will be set to 0.0.0 until an upgrade for the component is performed
    // Normalize version strings by removing 'v' prefix if present
    const normalizeVersion: (version: string | undefined) => string = (version: string | undefined): string => {
      if (!version) {
        return '0.0.0';
      }
      //for invalid version such v0.122  convert it to v0.122.0
      if (version.split('.').length === 2) {
        version = version + '.0';
      }
      return version.startsWith('v') ? version.slice(1) : version;
    };

    clone.versions = {
      cli: clone.metadata.soloVersion || getSoloVersion(),
      chart: normalizeVersion(clone.metadata.soloChartVersion),
      consensusNode: normalizeVersion(clone.metadata.hederaPlatformVersion),
      mirrorNodeChart: normalizeVersion(clone.metadata.hederaMirrorNodeChartVersion),
      explorerChart: normalizeVersion(clone.metadata.hederaExplorerChartVersion),
      jsonRpcRelayChart: normalizeVersion(clone.metadata.hederaJsonRpcRelayChartVersion),
      blockNodeChart: '0.0.0',
    };

    // need to keep track of the version of explorer chart since explorer label changed after
    // some specific version.
    const hederaExplorerChartVersion: string = clone.metadata.hederaExplorerChartVersion;

    // delete the old version structure
    delete clone.metadata.soloVersion;
    delete clone.metadata.soloChartVersion;
    delete clone.metadata.hederaPlatformVersion;
    delete clone.metadata.hederaMirrorNodeChartVersion;
    delete clone.metadata.hederaExplorerChartVersion;
    delete clone.metadata.hederaJsonRpcRelayChartVersion;

    // migrate the clusters
    const clusters: object[] = [];
    for (const cluster in clone.clusters) {
      const clusterObject: {
        name: string;
        namespace: string;
        deployment: string;
        dnsBaseDomain: string;
        dnsConsensusNodePattern: string;
      } = clone.clusters[cluster];

      clusters.push({
        name: clusterObject.name,
        namespace: clusterObject.namespace,
        deployment: clusterObject.deployment,
        dnsBaseDomain: clusterObject.dnsBaseDomain,
        // change from the old "network-${nodeAlias}-svc.${namespace}.svc" to "network-{nodeAlias}-svc.{namespace}.svc"
        // to align with the default value of the flag dnsConsensusNodePattern
        dnsConsensusNodePattern: clusterObject.dnsConsensusNodePattern.replaceAll('${', '{'),
      });
    }

    // overlay the old cluster references with the new cluster references structure
    clone.clusters = clusters;

    // now stored at the cluster level only
    delete clone.metadata.namespace;
    delete clone.metadata.deploymentName;

    // migrate the components
    clone.state = {
      ledgerPhase: 'initialized',
      consensusNodes: [],
      blockNodes: [],
      mirrorNodes: [],
      relayNodes: [],
      haProxies: [],
      envoyProxies: [],
      explorers: [],
    };

    // Ensure components exists to avoid errors
    if (!clone.components) {
      clone.components = {
        consensusNodes: {},
        haProxies: {},
        envoyProxies: {},
        mirrorNodes: {},
        relays: {},
        mirrorNodeExplorers: {},
      };
    }

    // migrate the consensus nodes
    if (clone.components.consensusNodes) {
      for (const consensusNode in clone.components.consensusNodes) {
        const component: {
          name: string;
          nodeId: number;
          namespace: string;
          cluster: string;
        } = clone.components.consensusNodes[consensusNode];

        clone.state.consensusNodes.push({
          metadata: {
            id: component.nodeId,
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    //migrate haproxies
    if (clone.components.haProxies) {
      for (const haproxy in clone.components.haProxies) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.haProxies[haproxy];

        clone.state.haProxies.push({
          metadata: {
            id: Templates.nodeIdFromNodeAlias(<NodeAlias>component.name),
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // migrate envoy proxies
    if (clone.components.envoyProxies) {
      for (const envoyProxy in clone.components.envoyProxies) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.envoyProxies[envoyProxy];

        clone.state.envoyProxies.push({
          metadata: {
            id: Templates.nodeIdFromNodeAlias(<NodeAlias>component.name),
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // migrate explorers
    if (clone.components.mirrorNodeExplorers) {
      for (const explorer in clone.components.mirrorNodeExplorers) {
        const component: {
          name: string;
          nodeId: number;
          namespace: string;
          cluster: string;
        } = clone.components.mirrorNodeExplorers[explorer];

        clone.state.explorers.push({
          version: hederaExplorerChartVersion,
          metadata: {
            id: 0,
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // migrate mirror nodes
    if (clone.components.mirrorNodes) {
      for (const mirrorNode in clone.components.mirrorNodes) {
        const component: {
          name: string;
          nodeId: number;
          namespace: string;
          cluster: string;
        } = clone.components.mirrorNodes[mirrorNode];

        clone.state.mirrorNodes.push({
          metadata: {
            id: 0,
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // migrate relay nodes
    if (clone.components.relays) {
      for (const relayNode in clone.components.relays) {
        const component: {
          consensusNodeAliases: string[];
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.relays[relayNode];

        // convert component.consensusNodeAliases [node1, node2 ] to [1, 2]
        const consensusNodeIds: number[] = component.consensusNodeAliases.map((alias: string): number =>
          Templates.nodeIdFromNodeAlias(alias as NodeAlias),
        );
        clone.state.relayNodes.push({
          consensusNodeIds: consensusNodeIds,
          metadata: {
            id: 0,
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // migrate block node
    if (clone.components.blockNodes) {
      for (const blockNode in clone.components.blockNodes) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.blockNodes[blockNode];

        clone.state.blockNodes.push({
          metadata: {
            id: Templates.nodeIdFromNodeAlias(<NodeAlias>component.name),
            // name: component.name,
            namespace: component.namespace,
            cluster: component.cluster,
            phase: 'started',
          },
        });
      }
    }

    // delete the old components structure
    delete clone.components;

    // migrate the history
    clone.history = {};
    clone.history.commands = [];

    // Handle the case when commandHistory is undefined
    if (clone.commandHistory) {
      // Check if commandHistory is an array or an object
      if (Array.isArray(clone.commandHistory)) {
        // If it's an array, push each item to the command array
        for (const historyItem of clone.commandHistory) {
          clone.history.commands.push(historyItem);
        }
      } else if (typeof clone.commandHistory === 'object') {
        // If it's an object, push each key to the command array
        for (const key in clone.commandHistory) {
          clone.history.commands.push(key);
        }
      }
      // delete the old command history
      delete clone.commandHistory;
    }

    // migrate the last executed command
    if (clone.lastExecutedCommand) {
      clone.history.lastExecutedCommand = clone.lastExecutedCommand;
      // delete the old last executed command
      delete clone.lastExecutedCommand;
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
