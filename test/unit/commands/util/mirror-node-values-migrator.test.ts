// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {MirrorNodeValuesMigrator} from '../../../../src/commands/util/mirror-node-values-migrator.js';

describe('MirrorNodeValuesMigrator', (): void => {
  describe('migrateBlockNodeEndpoints', (): void => {
    it('moves nodes[].host/port into endpoints[] under both configuration roots', (): void => {
      const values: Record<string, unknown> = {
        importer: {
          config: {
            hiero: {mirror: {importer: {block: {nodes: [{host: 'bn-1', port: 1234, requiresTls: true}]}}}},
            hedera: {mirror: {importer: {block: {nodes: [{host: 'bn-2'}]}}}},
          },
        },
      };

      const migrated: any = MirrorNodeValuesMigrator.migrateBlockNodeEndpoints(values);

      expect(migrated.importer.config.hiero.mirror.importer.block.nodes).to.deep.equal([
        {endpoints: [{host: 'bn-1', port: 1234, requiresTls: true}]},
      ]);
      expect(migrated.importer.config.hedera.mirror.importer.block.nodes).to.deep.equal([
        {endpoints: [{host: 'bn-2', port: 40_840, requiresTls: false}]},
      ]);
    });

    it('keeps every other install-time value and does not modify its input', (): void => {
      const values: Record<string, unknown> = {
        importer: {
          podAnnotations: {marker: 'x'},
          config: {hiero: {mirror: {importer: {block: {nodes: [{host: 'a'}]}}}}},
        },
        web3: {replicas: 2},
      };
      const original: string = JSON.stringify(values);

      const migrated: any = MirrorNodeValuesMigrator.migrateBlockNodeEndpoints(values);

      expect(migrated.importer.podAnnotations).to.deep.equal({marker: 'x'});
      expect(migrated.web3).to.deep.equal({replicas: 2});
      expect(JSON.stringify(values)).to.equal(original);
    });

    it('leaves nodes already using endpoints[] untouched', (): void => {
      const nodes: object[] = [{endpoints: [{host: 'a', port: 1, requiresTls: false}]}];
      const values: Record<string, unknown> = {
        importer: {config: {hiero: {mirror: {importer: {block: {nodes}}}}}},
      };

      const migrated: any = MirrorNodeValuesMigrator.migrateBlockNodeEndpoints(values);

      expect(migrated.importer.config.hiero.mirror.importer.block.nodes).to.deep.equal(nodes);
    });

    it('drops the stale importer env vars Solo generated for the legacy schema only', (): void => {
      const values: Record<string, unknown> = {
        importer: {
          env: {
            HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST: 'bn',
            HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_PORT: 1,
            SPRING_PROFILES_ACTIVE: 'kubernetes',
          },
        },
      };

      const migrated: any = MirrorNodeValuesMigrator.migrateBlockNodeEndpoints(values);

      expect(migrated.importer.env).to.deep.equal({SPRING_PROFILES_ACTIVE: 'kubernetes'});
    });

    it('returns values without an importer section unchanged', (): void => {
      expect(MirrorNodeValuesMigrator.migrateBlockNodeEndpoints({db: {name: 'x'}})).to.deep.equal({db: {name: 'x'}});
    });
  });
});
