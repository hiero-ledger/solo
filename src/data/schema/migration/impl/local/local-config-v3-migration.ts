// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../../core/errors/solo-errors.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {SemanticVersion} from '../../../../../business/utils/semantic-version.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';
import {HEDERA_CHAIN_ID} from '../../../../../core/constants.js';

// Adds `chainId` to every deployment, set to the default chain ID (SOLO_CHAIN_ID, else 298)
export class LocalConfigV3Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(2);
  }

  public get version(): SemanticVersion<number> {
    return new SemanticVersion(3);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new SoloErrors.validation.illegalArgument('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: Record<string, any> = structuredClone(source) as Record<string, any>;

    if (clone.schemaVersion !== 2) {
      throw new InvalidSchemaVersionError(clone.schemaVersion, 2);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const deployment of (clone.deployments ?? []) as Record<string, any>[]) {
      deployment.chainId ??= Number(HEDERA_CHAIN_ID);
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.major;

    return Promise.resolve(clone);
  }
}
