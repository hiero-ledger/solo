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
    it('returns a single in-place step when staying below 0.28.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.26.0',
        '0.27.9',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.26.0');
      expect(steps[0].toVersion).to.equal('0.27.9');
    });

    it('returns a single in-place step when staying above 0.28.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.28.0',
        '0.29.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('in-place');
      expect(steps[0].fromVersion).to.equal('0.28.0');
      expect(steps[0].toVersion).to.equal('0.29.0');
    });
  });

  describe('upgrade crossing the 0.28.0 boundary', (): void => {
    it('returns a single recreate step when upgrading from below to exactly 0.28.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.27.0',
        '0.28.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.27.0');
      expect(steps[0].toVersion).to.equal('0.28.0');
    });

    it('returns a single recreate step going directly to target when crossing 0.28.0', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.26.2',
        '0.28.5',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
      expect(steps[0].fromVersion).to.equal('0.26.2');
      expect(steps[0].toVersion).to.equal('0.28.5');
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
        '0.26.2',
        '0.28.0',
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
        '0.26.2',
        '0.28.0',
      );

      expect(steps).to.have.length(1);
      expect(steps[0].strategy).to.equal('recreate');
    });
  });

  describe('step metadata', (): void => {
    it('includes reason text in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.26.2',
        '0.28.0',
      );

      expect(steps[0].reason).to.be.a('string').and.not.equal('');
    });

    it('includes extraCommandArgs array in migration steps', (): void => {
      const steps: ComponentUpgradeMigrationStep[] = planComponentUpgradeMigrationPath(
        'block-node',
        '0.26.2',
        '0.28.0',
      );

      expect(steps[0].extraCommandArgs).to.be.an('array');
    });
  });
});
