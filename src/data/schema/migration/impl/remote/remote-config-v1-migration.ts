// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';
import {getSoloVersion} from '../../../../../../version.js';

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

    // Preserve the original metadata and add lastUpdated information
    const originalMetadata = clone.metadata || {};
    clone.metadata = {
      ...originalMetadata,
      lastUpdatedAt: new Date(),
      lastUpdatedBy: {
        name: 'system',
        hostname: 'migration',
      },
    };

    // pull the versions from the old config, if it isn't set, then it will be set to 0.0.0 until an upgrade for the component is performed
    clone.versions = {
      cli: clone.metadata.soloVersion ?? getSoloVersion(),
      chart: clone.metadata.soloChartVersion ?? '0.0.0',
      consensusNode: clone.metadata.hederaPlatformVersion ?? '0.0.0',
      mirrorNodeChart: clone.metadata.hederaMirrorNodeChartVersion ?? '0.0.0',
      explorerChart: clone.metadata.hederaExplorerChartVersion ?? '0.0.0',
      jsonRpcRelayChart: clone.metadata.hederaJsonRpcRelayChartVersion ?? '0.0.0',
      blockNodeChart: clone?.metadata?.hederaJsonRpcRelayChartVersion ?? '0.0.0',
    };

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
        dnsConsensusNodePattern: clusterObject.dnsConsensusNodePattern,
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
      consensusNodes: {},
      blockNodes: {},
      mirrorNodes: {},
      relayNodes: {},
      haProxies: {},
      envoyProxies: {},
      explorers: {},
    };

    // Ensure components exists to avoid errors
    if (!clone.components) {
      clone.components = {
        consensusNodes: {},
        haProxies: {},
        envoyProxies: {},
        mirrorNodes: {},
        relayNodes: {},
        explorers: {},
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

        clone.state.consensusNodes[consensusNode] = {
          id: component.nodeId,
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
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

        clone.state.haProxies[haproxy] = {
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
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

        clone.state.envoyProxies[envoyProxy] = {
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
      }
    }

    // migrate explorers
    if (clone.components.explorers) {
      for (const explorer in clone.components.explorers) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.explorers[explorer];

        clone.state.explorers[explorer] = {
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
      }
    }

    // migrate mirror nodes
    if (clone.components.mirrorNodes) {
      for (const mirrorNode in clone.components.mirrorNodes) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.mirrorNodes[mirrorNode];

        clone.state.mirrorNodes[mirrorNode] = {
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
      }
    }

    // migrate relay nodes
    if (clone.components.relayNodes) {
      for (const relayNode in clone.components.relayNodes) {
        const component: {
          name: string;
          namespace: string;
          cluster: string;
        } = clone.components.relayNodes[relayNode];

        clone.state.relayNodes[relayNode] = {
          name: component.name,
          namespace: component.namespace,
          cluster: component.cluster,
          phase: 'started',
        };
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
