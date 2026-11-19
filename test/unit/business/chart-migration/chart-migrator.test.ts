// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import fs from 'node:fs';
import yaml from 'yaml';
import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {beforeEach, describe, it} from 'mocha';

import {ChartMigrator} from '../../../../src/business/chart-migration/chart-migrator.js';
import {type ChartMigration} from '../../../../src/business/chart-migration/chart-migration.js';
import {type ChartMigrationContext} from '../../../../src/business/chart-migration/chart-migration-context.js';
import {type ChartMigrationRegistry} from '../../../../src/business/chart-migration/chart-migration-registry.js';
import {type ChartMigrationRequest} from '../../../../src/business/chart-migration/chart-migration-request.js';
import {type ChartUpgradeValues} from '../../../../src/business/chart-migration/chart-upgrade-values.js';
import {VersionRange} from '../../../../src/business/utils/version-range.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {ReleaseItem} from '../../../../src/integration/helm/model/release/release-item.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

type Hook = (context: ChartMigrationContext) => Promise<void>;

const CHART: string = 'hedera-mirror';
const RELEASE: string = 'mirror-1';

const migrationOf: (
  name: string,
  begin: string,
  end: string,
  beforeUpgrade?: Hook,
  afterUpgrade?: Hook,
) => ChartMigration = (
  name: string,
  begin: string,
  end: string,
  beforeUpgrade: Hook = async (): Promise<void> => undefined,
  afterUpgrade?: Hook,
): ChartMigration => ({
  name,
  chartName: CHART,
  range: VersionRange.fromSemanticVersionBounds(new SemanticVersion<string>(begin), new SemanticVersion<string>(end)),
  beforeUpgrade,
  afterUpgrade,
});

const readValueFiles: (valueArguments: string[]) => Record<string, unknown>[] = (
  valueArguments: string[],
): Record<string, unknown>[] =>
  valueArguments
    .filter((argument: string): boolean => argument.includes('solo-chart-migration-'))
    .map((path: string): Record<string, unknown> => yaml.parse(fs.readFileSync(path, 'utf8')));

describe('ChartMigrator', (): void => {
  let migrations: ChartMigration[];
  let deployedChart: string | undefined;
  let helm: {listReleases: SinonStub; getValues: SinonStub};
  let upgradeChart: SinonStub;
  let capturedFiles: Record<string, unknown>[];

  const logger: SoloLogger = {debug: sinon.stub(), info: sinon.stub()} as unknown as SoloLogger;

  const registry: ChartMigrationRegistry = {
    get migrations(): ChartMigration[] {
      return migrations;
    },
    migrationsFor: (chartName: string): ChartMigration[] =>
      migrations.filter((migration: ChartMigration): boolean => migration.chartName === chartName),
  } as unknown as ChartMigrationRegistry;

  const requestOf: (targetVersion: string, reuseValues?: boolean) => ChartMigrationRequest = (
    targetVersion: string,
    reuseValues: boolean = false,
  ): ChartMigrationRequest => ({
    namespace: NamespaceName.of('solo'),
    releaseName: RELEASE,
    kubeContext: 'kind-solo',
    targetVersion,
    chartValues: new HelmChartValues().set('solo.key', 'computed').userFile('/user/values.yaml'),
    reuseValues,
  });

  const upgrade: (targetVersion: string, reuseValues?: boolean) => Promise<ChartUpgradeValues> = async (
    targetVersion: string,
    reuseValues: boolean = false,
  ): Promise<ChartUpgradeValues> => {
    await new ChartMigrator(helm as unknown as HelmClient, logger, registry).upgrade(
      requestOf(targetVersion, reuseValues),
      upgradeChart,
    );
    expect(upgradeChart).to.have.been.calledOnce;
    return upgradeChart.firstCall.args[0] as ChartUpgradeValues;
  };

  const callerArguments: string[] = ['--set', 'solo.key=computed', '--values', '/user/values.yaml'];

  beforeEach((): void => {
    migrations = [];
    deployedChart = 'hedera-mirror-0.155.0';
    capturedFiles = [];
    helm = {
      listReleases: sinon
        .stub()
        .callsFake(async (): Promise<ReleaseItem[]> =>
          deployedChart ? [new ReleaseItem(RELEASE, 'solo', '1', '', 'deployed', deployedChart, '')] : [],
        ),
      getValues: sinon.stub().resolves({importer: {nodes: [{host: 'bn-1'}]}, web3: {replicas: 2}}),
    };
    upgradeChart = sinon.stub().callsFake(async (values: ChartUpgradeValues): Promise<void> => {
      capturedFiles = readValueFiles(values.valueArguments);
    });
  });

  describe('when no migration applies', (): void => {
    it('upgrades with the caller values without looking up the release when no migration is registered', async (): Promise<void> => {
      const values: ChartUpgradeValues = await upgrade('0.160.0', true);

      expect(values).to.deep.equal({valueArguments: callerArguments, reuseValues: true});
      expect(helm.listReleases).not.to.have.been.called;
    });

    const skipped: [string, string, string | undefined][] = [
      ['the deployed release is from another chart', '0.160.0', 'hiero-explorer-chart-0.155.0'],
      ['the deployed version is at or after the end of the range', '0.160.0', 'hedera-mirror-0.157.0'],
      ['the target version is before the end of the range', '0.156.0', 'hedera-mirror-0.155.0'],
      ['the deployed version is before the start of the range', '0.160.0', 'hedera-mirror-0.151.0'],
      ['the release is not installed yet', '0.160.0', undefined],
      ['the deployed chart has no version', '0.160.0', 'hedera-mirror'],
      ['the target version is empty', '', 'hedera-mirror-0.155.0'],
      ['the target version is not a semantic version', 'latest', 'hedera-mirror-0.155.0'],
    ];

    for (const [reason, targetVersion, chart] of skipped) {
      it(`skips the migration when ${reason}`, async (): Promise<void> => {
        const beforeUpgrade: SinonStub = sinon.stub().resolves();
        migrations = [migrationOf('block-node-endpoints', '0.152.0', '0.157.0', beforeUpgrade)];
        deployedChart = chart;

        const values: ChartUpgradeValues = await upgrade(targetVersion, true);

        expect(beforeUpgrade).not.to.have.been.called;
        expect(values).to.deep.equal({valueArguments: callerArguments, reuseValues: true});
      });
    }
  });

  describe('when migrations apply', (): void => {
    it('runs a migration whose range holds the deployed version and whose end the upgrade crosses', async (): Promise<void> => {
      const beforeUpgrade: SinonStub = sinon.stub().resolves();
      migrations = [migrationOf('block-node-endpoints', '0.152.0', '0.157.0', beforeUpgrade)];

      await upgrade('0.157.0');

      const context: ChartMigrationContext = beforeUpgrade.firstCall.args[0] as ChartMigrationContext;
      expect(context.releaseName).to.equal(RELEASE);
      expect(context.chartName).to.equal(CHART);
      expect(context.kubeContext).to.equal('kind-solo');
      expect(context.currentVersion.toString()).to.equal('0.155.0');
      expect(context.targetVersion.toString()).to.equal('0.157.0');
    });

    it('matches the migration on the deployed chart name, whatever reference the upgrade uses', async (): Promise<void> => {
      const beforeUpgrade: SinonStub = sinon.stub().resolves();
      migrations = [
        {...migrationOf('explorer-change', '0.0.0', '26.0.0', beforeUpgrade), chartName: 'hiero-explorer-chart'},
      ];
      deployedChart = 'hiero-explorer-chart-25.1.0';

      await upgrade('26.2.0');

      const context: ChartMigrationContext = beforeUpgrade.firstCall.args[0] as ChartMigrationContext;
      expect(context.chartName).to.equal('hiero-explorer-chart');
      expect(context.currentVersion.toString()).to.equal('25.1.0');
    });

    it('treats a pre-release of the boundary as crossing a range ending in a -0 pre-release', async (): Promise<void> => {
      const beforeUpgrade: SinonStub = sinon.stub().resolves();
      migrations = [migrationOf('block-node-endpoints', '0.0.0', '0.157.0-0', beforeUpgrade)];

      await upgrade('0.157.0-rc1');

      expect(beforeUpgrade).to.have.been.calledOnce;
    });

    it('runs the migrations oldest boundary first, whatever the registration order', async (): Promise<void> => {
      const order: string[] = [];
      const recording: (name: string) => Hook =
        (name: string): Hook =>
        async (): Promise<void> => {
          order.push(name);
        };
      migrations = [
        migrationOf('second', '0.0.0', '0.160.0', recording('second')),
        migrationOf('first', '0.0.0', '0.157.0', recording('first')),
      ];

      await upgrade('0.165.0');

      expect(order).to.deep.equal(['first', 'second']);
    });

    it('feeds carried release values to Helm before every caller argument and drops --reuse-values', async (): Promise<void> => {
      migrations = [
        migrationOf(
          'block-node-endpoints',
          '0.0.0',
          '0.157.0',
          async (context: ChartMigrationContext): Promise<void> => {
            const values: Record<string, unknown> = await context.releaseValues();
            values.importer = {nodes: [{endpoints: [{host: 'bn-1'}]}]};
            context.carryReleaseValues(values);
          },
        ),
      ];

      const values: ChartUpgradeValues = await upgrade('0.157.0', true);

      expect(values.reuseValues).to.be.false;
      expect(values.valueArguments.slice(2)).to.deep.equal(callerArguments);
      expect(values.valueArguments[0]).to.equal('--values');
      expect(capturedFiles).to.deep.equal([{importer: {nodes: [{endpoints: [{host: 'bn-1'}]}]}, web3: {replicas: 2}}]);
    });

    it('hands each migration the release values carried by the one before it', async (): Promise<void> => {
      let seenBySecond: Record<string, unknown> | undefined;
      migrations = [
        migrationOf('first', '0.0.0', '0.157.0', async (context: ChartMigrationContext): Promise<void> => {
          context.carryReleaseValues({...(await context.releaseValues()), migratedBy: 'first'});
        }),
        migrationOf('second', '0.0.0', '0.160.0', async (context: ChartMigrationContext): Promise<void> => {
          seenBySecond = await context.releaseValues();
          context.carryReleaseValues({...seenBySecond, migratedBy: 'second'});
        }),
      ];

      await upgrade('0.160.0');

      expect(seenBySecond).to.include({migratedBy: 'first'});
      expect(capturedFiles).to.have.length(1);
      expect(capturedFiles[0]).to.include({migratedBy: 'second'});
      expect(helm.getValues).to.have.been.calledOnceWith(RELEASE, 'solo', 'kind-solo');
    });

    it('keeps --reuse-values for inherited values and layers them over carried values in order', async (): Promise<void> => {
      migrations = [
        migrationOf('first', '0.0.0', '0.157.0', async (context: ChartMigrationContext): Promise<void> => {
          context.addInheritedValues({importer: {replicas: 1}});
        }),
        migrationOf('second', '0.0.0', '0.160.0', async (context: ChartMigrationContext): Promise<void> => {
          context.addInheritedValues({importer: {replicas: 3}});
        }),
      ];

      const values: ChartUpgradeValues = await upgrade('0.160.0', true);

      expect(values.reuseValues).to.be.true;
      expect(capturedFiles).to.deep.equal([{importer: {replicas: 1}}, {importer: {replicas: 3}}]);
      expect(values.valueArguments.slice(4)).to.deep.equal(callerArguments);
    });

    it('does not let a migration change values it already contributed or read', async (): Promise<void> => {
      migrations = [
        migrationOf('mutating', '0.0.0', '0.157.0', async (context: ChartMigrationContext): Promise<void> => {
          const inherited: Record<string, unknown> = {key: 'contributed'};
          context.addInheritedValues(inherited);
          inherited.key = 'changed afterwards';
          const firstRead: Record<string, unknown> = await context.releaseValues();
          firstRead.web3 = 'changed';
          const secondRead: Record<string, unknown> = await context.releaseValues();
          expect(secondRead.web3).to.deep.equal({replicas: 2});
        }),
      ];

      await upgrade('0.157.0');

      expect(capturedFiles).to.deep.equal([{key: 'contributed'}]);
    });

    it('passes the caller values unchanged when the migrations contribute none', async (): Promise<void> => {
      migrations = [migrationOf('cluster-only', '0.0.0', '0.157.0')];

      const values: ChartUpgradeValues = await upgrade('0.157.0', true);

      expect(values).to.deep.equal({valueArguments: callerArguments, reuseValues: true});
    });

    it('removes the values files after the upgrade, and after a failed upgrade', async (): Promise<void> => {
      migrations = [
        migrationOf('carry', '0.0.0', '0.157.0', async (context: ChartMigrationContext): Promise<void> => {
          context.carryReleaseValues(await context.releaseValues());
        }),
      ];

      const values: ChartUpgradeValues = await upgrade('0.157.0');
      expect(fs.existsSync(values.valueArguments[1])).to.be.false;

      upgradeChart = sinon.stub().rejects(new Error('helm failed'));
      const error: unknown = await new ChartMigrator(helm as unknown as HelmClient, logger, registry)
        .upgrade(requestOf('0.157.0'), upgradeChart)
        .catch((error_: unknown): unknown => error_);

      expect((error as Error).message).to.equal('helm failed');
      expect(fs.existsSync((upgradeChart.firstCall.args[0] as ChartUpgradeValues).valueArguments[1])).to.be.false;
    });

    it('runs afterUpgrade hooks only once the upgrade succeeded', async (): Promise<void> => {
      const afterUpgrade: SinonStub = sinon.stub().resolves();
      migrations = [migrationOf('cleanup', '0.0.0', '0.157.0', undefined, afterUpgrade)];

      await upgrade('0.157.0');
      expect(afterUpgrade).to.have.been.calledOnce;
      expect(afterUpgrade).to.have.been.calledAfter(upgradeChart);

      afterUpgrade.resetHistory();
      upgradeChart = sinon.stub().rejects(new Error('helm failed'));
      await new ChartMigrator(helm as unknown as HelmClient, logger, registry)
        .upgrade(requestOf('0.157.0'), upgradeChart)
        .catch((): void => undefined);
      expect(afterUpgrade).not.to.have.been.called;
    });
  });

  describe('when a migration fails', (): void => {
    const failure: (hook: 'beforeUpgrade' | 'afterUpgrade', error: Error) => Promise<unknown> = async (
      hook: 'beforeUpgrade' | 'afterUpgrade',
      error: Error,
    ): Promise<unknown> => {
      const failing: Hook = async (): Promise<void> => {
        throw error;
      };
      migrations = [
        hook === 'beforeUpgrade'
          ? migrationOf('broken', '0.0.0', '0.157.0', failing)
          : migrationOf('broken', '0.0.0', '0.157.0', undefined, failing),
      ];

      return new ChartMigrator(helm as unknown as HelmClient, logger, registry)
        .upgrade(requestOf('0.157.0'), upgradeChart)
        .catch((error_: unknown): unknown => error_);
    };

    it('names the migration and the release, and does not upgrade, when beforeUpgrade fails', async (): Promise<void> => {
      const error: unknown = await failure('beforeUpgrade', new Error('cluster unreachable'));

      expect(error).to.be.instanceOf(SoloErrors.system.helmChartMigrationFailed);
      expect((error as Error).message)
        .to.contain("'broken'")
        .and.to.contain(`'${RELEASE}'`);
      expect((error as Error).message).to.contain('cluster unreachable');
      expect(upgradeChart).not.to.have.been.called;
    });

    it('names the migration when afterUpgrade fails', async (): Promise<void> => {
      const error: unknown = await failure('afterUpgrade', new Error('cleanup failed'));

      expect(error).to.be.instanceOf(SoloErrors.system.helmChartMigrationFailed);
      expect(upgradeChart).to.have.been.calledOnce;
    });

    it('reports a release whose values cannot be read instead of upgrading without them', async (): Promise<void> => {
      helm.getValues.rejects(new Error('connection refused'));
      migrations = [
        migrationOf('carry', '0.0.0', '0.157.0', async (context: ChartMigrationContext): Promise<void> => {
          context.carryReleaseValues(await context.releaseValues());
        }),
      ];

      const error: unknown = await new ChartMigrator(helm as unknown as HelmClient, logger, registry)
        .upgrade(requestOf('0.157.0'), upgradeChart)
        .catch((error_: unknown): unknown => error_);

      expect(error).to.be.instanceOf(SoloErrors.system.helmChartMigrationFailed);
      expect((error as Error).cause).to.be.instanceOf(SoloErrors.system.helmReleaseValuesReadFailed);
      expect(upgradeChart).not.to.have.been.called;
    });
  });
});
