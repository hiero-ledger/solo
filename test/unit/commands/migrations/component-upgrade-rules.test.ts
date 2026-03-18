// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {
  planComponentUpgradeMigrationPath,
  resetUpgradeMigrationConfigCache,
  type ComponentUpgradeMigrationConfigFile,
  type ComponentUpgradeMigrationStep,
} from '../../../../src/commands/migrations/component-upgrade-rules.js';
import * as constants from '../../../../src/core/constants.js';
import sinon from 'sinon';

describe('planComponentUpgradeMigrationPath', (): void => {
  let existsSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach((): void => {
    resetUpgradeMigrationConfigCache();
    existsSyncStub = sinon.stub(fs, 'existsSync');
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(false);
    existsSyncStub.callThrough();
    readFileSyncStub.callThrough();
  });

  afterEach((): void => {
    resetUpgradeMigrationConfigCache();
    sinon.restore();
  });

  describe('same version (no-op upgrade)', (): void => {
    it('returns a single in-place step for same version', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.27.0',
        '0.27.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.27.0');
      expect(steps[0].toVersion).to.equal('0.27.0');
    });
  });

  describe('downgrade (no forward boundary crossing)', (): void => {
    it('returns a single in-place step when downgrading', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.29.0',
        '0.27.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.29.0');
      expect(steps[0].toVersion).to.equal('0.27.0');
    });
  });

  describe('upgrade not crossing a boundary', (): void => {
    it('returns a single in-place step when staying below 0.29.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.28.5',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.28.5');
    });

    it('returns a single in-place step when staying above 0.29.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.29.0',
        '0.30.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.29.0');
      expect(steps[0].toVersion).to.equal('0.30.0');
    });
  });

  describe('upgrade crossing the 0.29.0 boundary', (): void => {
    it('returns a single recreate step when upgrading from below to exactly 0.29.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.29.0');
    });

    it('returns a single recreate step going directly to target when crossing 0.29.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.5',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.29.5');
    });

    it('splits into multiple steps when multiple boundaries with different strategies are crossed', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'multi-boundary': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Immutable field change at 2.0.0'},
              {version: '3.0.0', strategy: 'in-place', reason: 'Config change at 3.0.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'multi-boundary',
        '1.0.0',
        '4.0.0',
      );

      expect(steps).to.have.length(2);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
      expect(steps[1].strategy).to.equal('in-place');
      expect(steps[1].fromVersion).to.equal('2.0.0');
      expect(steps[1].toVersion).to.equal('4.0.0');
    });

    it('merges consecutive boundaries with the same strategy into a single step', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'merge-test': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'First recreate'},
              {version: '3.0.0', strategy: 'recreate', reason: 'Second recreate'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath('merge-test', '1.0.0', '4.0.0');

      // Both recreate boundaries should merge into a single step jumping to the target
      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('4.0.0');
    });

    it('handles three alternating-strategy boundaries correctly', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          alternating: {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Recreate at 2.0'},
              {version: '3.0.0', strategy: 'in-place', reason: 'In-place at 3.0'},
              {version: '4.0.0', strategy: 'recreate', reason: 'Recreate at 4.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath('alternating', '1.0.0', '5.0.0');

      // 3 distinct strategy segments: recreate → in-place → recreate
      expect(steps).to.have.length(3);
      expect(steps[0]).to.deep.include({fromVersion: '1.0.0', toVersion: '2.0.0', strategy: 'recreate'});
      expect(steps[1]).to.deep.include({fromVersion: '2.0.0', toVersion: '3.0.0', strategy: 'in-place'});
      expect(steps[2]).to.deep.include({fromVersion: '3.0.0', toVersion: '5.0.0', strategy: 'recreate'});
    });

    it('only crosses boundaries within the upgrade range, not all boundaries', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'partial-cross': {
            defaultStrategy: 'in-place',
            boundaries: [
              {version: '2.0.0', strategy: 'recreate', reason: 'Recreate at 2.0'},
              {version: '5.0.0', strategy: 'recreate', reason: 'Recreate at 5.0'},
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      // Upgrading 1.0→3.0 only crosses 2.0, not 5.0
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'partial-cross',
        '1.0.0',
        '3.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('3.0.0');
    });
  });

  describe('unknown component', (): void => {
    it('returns a single in-place step with default strategy for unknown component', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'unknown-component',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
    });
  });

  describe('custom config file override', (): void => {
    it('loads custom config from file and applies its boundary rules', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'my-component': {
            defaultStrategy: 'in-place',
            boundaries: [
              {
                version: '2.0.0',
                strategy: 'recreate',
                reason: 'Breaking change at 2.0.0',
              },
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'my-component',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('1.0.0');
      expect(steps[0].toVersion).to.equal('2.0.0');
    });

    it('falls back to default config if the file has invalid JSON', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns('not valid json');

      // Should still work with block-node defaults
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
    });

    it('falls back to default config if the file is missing the components field', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify({notComponents: {}}));

      // Should still work with block-node defaults
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
    });
  });

  describe('step metadata', (): void => {
    it('includes reason text in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps[0].reason).to.be.a('string').and.not.equal('');
    });

    it('includes extraCommandArgs array in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps[0].extraCommandArgs).to.be.an('array');
    });

    it('propagates boundary-specific extraCommandArgs to the migration step', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'args-test': {
            defaultStrategy: 'in-place',
            boundaries: [
              {
                version: '2.0.0',
                strategy: 'recreate',
                reason: 'Breaking change',
                extraCommandArgs: ['--set', 'migration.enabled=true'],
              },
            ],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath('args-test', '1.0.0', '3.0.0');

      expect(steps[0].extraCommandArgs).to.deep.equal(['--set', 'migration.enabled=true']);
    });

    it('propagates defaultExtraCommandArgs to default-strategy steps', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'default-args-test': {
            defaultStrategy: 'in-place',
            defaultExtraCommandArgs: ['--timeout', '600s'],
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'default-args-test',
        '1.0.0',
        '2.0.0',
      );

      expect(steps[0].extraCommandArgs).to.deep.equal(['--timeout', '600s']);
    });
  });

  describe('version normalization', (): void => {
    it('handles versions with v prefix', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        'v0.28.0',
        'v0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.29.0');
    });

    it('handles pre-release versions (pre-release < release for same version)', (): void => {
      // 0.29.0-rc.1 < 0.29.0 in semver, so boundary at 0.29.0 is NOT crossed
      // when upgrading from 0.28.0 to 0.29.0-rc.1
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0-rc.1',
      );

      // target 0.29.0-rc.1 < boundary 0.29.0, so boundary is not crossed
      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
    });
  });

  describe('default strategy override', (): void => {
    it('uses recreate as default strategy when configured', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'recreate-default': {
            defaultStrategy: 'recreate',
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'recreate-default',
        '1.0.0',
        '2.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
    });

    it('uses recreate default strategy for downgrade when configured', (): void => {
      const customConfig: ComponentUpgradeMigrationConfigFile = {
        components: {
          'recreate-default': {
            defaultStrategy: 'recreate',
            boundaries: [],
          },
        },
      };

      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(true);
      readFileSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE, 'utf8').returns(JSON.stringify(customConfig));

      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'recreate-default',
        '2.0.0',
        '1.0.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].reason).to.equal('No forward upgrade boundary crossing detected');
    });
  });

  describe('config caching', (): void => {
    it('caches config after first load and does not re-read file', (): void => {
      existsSyncStub.withArgs(constants.UPGRADE_MIGRATIONS_FILE).returns(false);

      // First call loads and caches the default config
      planComponentUpgradeMigrationPath('block-node', '0.27.0', '0.28.0');
      // Second call should use cached config
      planComponentUpgradeMigrationPath('block-node', '0.27.0', '0.28.0');

      // existsSync should only be called once for the migration file
      const migrationFileCalls: sinon.SinonSpyCall[] = existsSyncStub
        .getCalls()
        .filter((call: sinon.SinonSpyCall): boolean => call.args[0] === constants.UPGRADE_MIGRATIONS_FILE);
      expect(migrationFileCalls).to.have.length(1);
    });
  });

  describe('downgrade across boundary', (): void => {
    it('does not apply boundary rules when downgrading across a boundary version', (): void => {
      // Downgrading from 0.29.0 to 0.26.0 crosses the 0.28.0 boundary backwards,
      // but boundaries only apply to forward upgrades
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.29.0',
        '0.26.0',
      );

      expect(steps).to.have.length(1);
      // Should use default strategy, NOT recreate from the boundary
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].reason).to.equal('No forward upgrade boundary crossing detected');
    });
  });
});
