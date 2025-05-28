// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {type RemoteConfigStructure} from '../../../model/remote/interfaces/remote-config-structure.js';
import {ComponentIdsShema} from '../../../model/remote/state/component-ids-shema.js';
import {type DeploymentStateStructure} from '../../../model/remote/interfaces/deployment-state-structure.js';

export class RemoteConfigV2Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(1);
  }

  public get version(): Version<number> {
    return new Version(2);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: RemoteConfigStructure = structuredClone(source) as any as RemoteConfigStructure;
    const state: DeploymentStateStructure = clone.state;

    const componentIds: ComponentIdsShema = new ComponentIdsShema();

    componentIds.consensusNodes = state?.consensusNodes?.length || 1;
    componentIds.envoyProxies = state?.envoyProxies?.length || 1;
    componentIds.mirrorNodes = state?.mirrorNodes?.length || 1;
    componentIds.explorers = state?.explorers?.length || 1;
    componentIds.haProxies = state?.haProxies?.length || 1;
    componentIds.blockNodes = state?.blockNodes?.length || 1;
    componentIds.relayNodes = state?.relayNodes?.length || 1;

    clone.state.componentIds = componentIds;

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
