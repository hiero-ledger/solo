// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {type RemoteConfigStructure} from '../../../model/remote/interfaces/remote-config-structure.js';
import {type DeploymentStateStructure} from '../../../model/remote/interfaces/deployment-state-structure.js';

// Unused currently, enable with wraps
export class RemoteConfigV5Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(4);
  }

  public get version(): Version<number> {
    return new Version(5);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: RemoteConfigStructure = structuredClone(source) as any as RemoteConfigStructure;
    const state: DeploymentStateStructure = clone.state;

    state.tssEnabled = false;

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
