// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ChartMigrationRegistry} from '../../../../src/business/chart-migration/chart-migration-registry.js';
import {type ChartMigration} from '../../../../src/business/chart-migration/chart-migration.js';

describe('ChartMigrationRegistry', (): void => {
  const migrations: readonly ChartMigration[] = new ChartMigrationRegistry().migrations;

  it('gives every registered migration a unique name, so logs and errors identify it', (): void => {
    const names: string[] = migrations.map((migration: ChartMigration): string => migration.name);
    expect(new Set(names).size).to.equal(names.length);
  });
});
