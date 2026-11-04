// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../../core/errors/solo-errors.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {SemanticVersion} from '../../../../../business/utils/semantic-version.js';

// The v9 migration introduces the top level `ledger` object: `state.ledgerPhase` moves to `ledger.phase`, and
// `ledger.realm` and `ledger.shard` are added. Existing deployments predate realm/shard in the remote config, so
// they are migrated to the default of 0.0.
export class RemoteConfigV9Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(8);
  }

  public get version(): SemanticVersion<number> {
    return new SemanticVersion(9);
  }

  public async migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new SoloErrors.validation.illegalArgument('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: Record<string, any> = structuredClone(source) as Record<string, any>;

    clone.ledger = {phase: clone.state?.ledgerPhase, realm: 0, shard: 0};
    delete clone.state?.ledgerPhase;

    // Set the schema version to the new version
    clone.schemaVersion = this.version.major;

    return clone;
  }
}
