// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';
import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {type RemoteConfigStructure} from '../../../model/remote/interfaces/remote-config-structure.js';
import {type DeploymentStateSchema} from '../../../model/remote/deployment-state-schema.js';

export class RemoteConfigV7Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(6);
  }

  public get version(): Version<number> {
    return new Version(7);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: RemoteConfigStructure = structuredClone(source) as any as RemoteConfigStructure;
    const state: DeploymentStateSchema = clone.state;

    // Initialise new component arrays (empty — no Postgres/Redis components existed before this schema version)
    if (!state.postgres) {
      state.postgres = [];
    }
    if (!state.redis) {
      state.redis = [];
    }

    // Initialise new component ID counters (start at 1, matching all other counters)
    if (!state.componentIds.postgres) {
      state.componentIds.postgres = 1;
    }
    if (!state.componentIds.redis) {
      state.componentIds.redis = 1;
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
