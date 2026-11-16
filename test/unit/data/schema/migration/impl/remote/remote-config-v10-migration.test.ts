// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {RemoteConfigV10Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v10-migration.js';
import {type VersionRange} from '../../../../../../../src/business/utils/version-range.js';

describe('RemoteConfigV10Migration', (): void => {
  const migration: RemoteConfigV10Migration = new RemoteConfigV10Migration();

  it('should migrate from schema version 9', (): void => {
    const range: VersionRange<number> = migration.range;
    expect(range.toString()).to.equal('[9, 10)');
    expect(migration.version.major).to.equal(10);
  });

  it('should leave the ledger chain ID unset', async (): Promise<void> => {
    const source: object = {schemaVersion: 9, ledger: {phase: 'initialized', realm: 1, shard: 2}};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate(source);

    expect(result.schemaVersion).to.equal(10);
    expect(result.ledger).to.deep.equal({phase: 'initialized', realm: 1, shard: 2});
  });

  it('should keep a chain ID that is already set', async (): Promise<void> => {
    const source: object = {schemaVersion: 9, ledger: {phase: 'initialized', realm: 0, shard: 0, chainId: 1234}};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate(source);

    expect(result.ledger.chainId).to.equal(1234);
  });

  it('should not mutate the source object', async (): Promise<void> => {
    const source: {schemaVersion: number; ledger: Record<string, unknown>} = {
      schemaVersion: 9,
      ledger: {phase: 'uninitialized', realm: 0, shard: 0},
    };

    await migration.migrate(source);

    expect(source.schemaVersion).to.equal(9);
  });

  it('should throw when the source is undefined', (): void => {
    expect((): Promise<object> => migration.migrate(undefined as unknown as object)).to.throw();
  });
});
