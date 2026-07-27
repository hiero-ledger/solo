// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../../core/errors/solo-errors.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {type RemoteConfigStructure} from '../../../model/remote/interfaces/remote-config-structure.js';
import {SemanticVersion} from '../../../../../business/utils/semantic-version.js';

// The v8 migration adds the deployment-wide block node message-size limit overrides to RemoteConfig.
// The new fields are intentionally left undefined: when absent, BlockNodesJsonWrapper falls back to the
// TSS config defaults, preserving existing behaviour for deployments created before this schema version.
export class RemoteConfigV8Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(7);
  }

  public get version(): SemanticVersion<number> {
    return new SemanticVersion(8);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new SoloErrors.validation.illegalArgument('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: RemoteConfigStructure = structuredClone(source) as any as RemoteConfigStructure;

    // Set the schema version to the new version
    clone.schemaVersion = this.version.major;

    return clone;
  }
}
