// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {RemoteConfigV9Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v9-migration.js';
import {type VersionRange} from '../../../../../../../src/business/utils/version-range.js';

describe('RemoteConfigV9Migration', (): void => {
  const migration: RemoteConfigV9Migration = new RemoteConfigV9Migration();

  it('should migrate from schema version 8', (): void => {
    const range: VersionRange<number> = migration.range;
    expect(range.toString()).to.equal('[8, 9)');
    expect(migration.version.major).to.equal(9);
  });

  it('should move state.ledgerPhase to ledger.phase and default realm and shard to 0', async (): Promise<void> => {
    const source: object = {schemaVersion: 8, state: {ledgerPhase: 'initialized', consensusNodes: []}};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate(source);

    expect(result.schemaVersion).to.equal(9);
    expect(result.ledger).to.deep.equal({phase: 'initialized', realm: 0, shard: 0});
    expect(result.state).to.not.have.property('ledgerPhase');
    expect(result.state.consensusNodes).to.deep.equal([]);
  });

  it('should not mutate the source object', async (): Promise<void> => {
    const source: {schemaVersion: number; state: {ledgerPhase: string}} = {
      schemaVersion: 8,
      state: {ledgerPhase: 'uninitialized'},
    };

    await migration.migrate(source);

    expect(source.state.ledgerPhase).to.equal('uninitialized');
    expect(source.schemaVersion).to.equal(8);
  });

  it('should throw when the source is null or undefined', async (): Promise<void> => {
    let thrown: boolean = false;
    try {
      await migration.migrate(null as unknown as object);
    } catch {
      thrown = true;
    }
    expect(thrown).to.equal(true);
  });
});
