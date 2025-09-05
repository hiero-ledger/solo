// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {type RemoteConfigStructure} from '../../../model/remote/interfaces/remote-config-structure.js';
import {ComponentIdsSchema} from '../../../model/remote/state/component-ids-schema.js';
import {type DeploymentStateStructure} from '../../../model/remote/interfaces/deployment-state-structure.js';
import {type NodeAlias, type NodeId} from '../../../../../types/aliases.js';
import {Templates} from '../../../../../core/templates.js';
import {type BaseStateSchema} from '../../../model/remote/state/base-state-schema.js';
import {type RelayNodeStateSchema} from '../../../model/remote/state/relay-node-state-schema.js';

export class RemoteConfigV3Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(2);
  }

  public get version(): Version<number> {
    return new Version(3);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: RemoteConfigStructure = structuredClone(source) as any as RemoteConfigStructure;
    const state: DeploymentStateStructure = clone.state;

    const componentIds: ComponentIdsSchema = new ComponentIdsSchema();

    componentIds.consensusNodes = (state?.consensusNodes?.length || 0) + 1;
    componentIds.envoyProxies = (state?.envoyProxies?.length || 0) + 1;
    componentIds.mirrorNodes = (state?.mirrorNodes?.length || 0) + 1;
    componentIds.explorers = (state?.explorers?.length || 0) + 1;
    componentIds.haProxies = (state?.haProxies?.length || 0) + 1;
    componentIds.blockNodes = (state?.blockNodes?.length || 0) + 1;
    componentIds.relayNodes = (state?.relayNodes?.length || 0) + 1;

    clone.state.componentIds = componentIds;

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function incrementComponentIds(components: BaseStateSchema[]): void {
      for (const component of components) {
        component.metadata.id++;
      }
    }

    incrementComponentIds(clone.state.consensusNodes);
    incrementComponentIds(clone.state.envoyProxies);
    incrementComponentIds(clone.state.mirrorNodes);
    incrementComponentIds(clone.state.explorers);
    incrementComponentIds(clone.state.haProxies);
    incrementComponentIds(clone.state.blockNodes);
    incrementComponentIds(clone.state.relayNodes);

    for (const component of clone.state.relayNodes) {
      if ((component as any)?.metadata?.consensusNodeIds) {
        if (typeof (component as any)?.metadata?.consensusNodeIds?.[0] === 'string') {
          (component as RelayNodeStateSchema).consensusNodeIds = (component as any).metadata.consensusNodeIds.map(
            (nodeAlias: NodeAlias): NodeId => Templates.nodeIdFromNodeAlias(nodeAlias),
          );
        } else if (typeof (component as any)?.metadata?.consensusNodeIds?.[0] === 'number') {
          (component as RelayNodeStateSchema).consensusNodeIds = (component as any).metadata.consensusNodeIds;
        }

        delete (component as any).metadata.consensusNodeIds;
      }
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
