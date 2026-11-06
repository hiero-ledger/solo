// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {LocalConfigV3Migration} from '../../../../../../../src/data/schema/migration/impl/local/local-config-v3-migration.js';
import {InvalidSchemaVersionError} from '../../../../../../../src/data/schema/migration/api/invalid-schema-version-error.js';
import {type VersionRange} from '../../../../../../../src/business/utils/version-range.js';
import {HEDERA_CHAIN_ID} from '../../../../../../../src/core/constants.js';

describe('LocalConfigV3Migration', (): void => {
  const migration: LocalConfigV3Migration = new LocalConfigV3Migration();

  it('should migrate from schema version 2', (): void => {
    const range: VersionRange<number> = migration.range;
    expect(range.toString()).to.equal('[2, 3)');
    expect(migration.version.major).to.equal(3);
  });

  it('should add the default chain ID to every deployment', async (): Promise<void> => {
    const source: object = {
      schemaVersion: 2,
      deployments: [
        {name: 'alpha', namespace: 'alpha-ns', clusters: ['cluster-1'], realm: 0, shard: 0},
        {name: 'beta', namespace: 'beta-ns', clusters: ['cluster-2'], realm: 1, shard: 2},
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate(source);

    expect(result.schemaVersion).to.equal(3);
    expect(result.deployments).to.deep.equal([
      {
        name: 'alpha',
        namespace: 'alpha-ns',
        clusters: ['cluster-1'],
        realm: 0,
        shard: 0,
        chainId: Number(HEDERA_CHAIN_ID),
      },
      {
        name: 'beta',
        namespace: 'beta-ns',
        clusters: ['cluster-2'],
        realm: 1,
        shard: 2,
        chainId: Number(HEDERA_CHAIN_ID),
      },
    ]);
  });

  it('should keep a chain ID that is already set', async (): Promise<void> => {
    const source: object = {schemaVersion: 2, deployments: [{name: 'alpha', chainId: 1234}]};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate(source);

    expect(result.deployments[0].chainId).to.equal(1234);
  });

  it('should migrate a local config without deployments', async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await migration.migrate({schemaVersion: 2});

    expect(result.schemaVersion).to.equal(3);
  });

  it('should not mutate the source object', async (): Promise<void> => {
    const source: {schemaVersion: number; deployments: Record<string, unknown>[]} = {
      schemaVersion: 2,
      deployments: [{name: 'alpha'}],
    };

    await migration.migrate(source);

    expect(source.schemaVersion).to.equal(2);
    expect(source.deployments[0]).to.not.have.property('chainId');
  });

  it('should reject a source that is not at schema version 2', (): void => {
    expect((): Promise<object> => migration.migrate({schemaVersion: 1, deployments: []})).to.throw(
      InvalidSchemaVersionError,
      "Invalid schema version '1'; expected version '2'",
    );
  });

  it('should throw when the source is undefined', (): void => {
    expect((): Promise<object> => migration.migrate(undefined as unknown as object)).to.throw();
  });
});
