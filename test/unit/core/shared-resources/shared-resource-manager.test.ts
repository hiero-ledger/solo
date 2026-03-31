// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';

import {SharedResourceManager} from '../../../../src/core/shared-resources/shared-resource-manager.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../../src/core/constants.js';
import {type AnyObject} from '../../../../src/types/aliases.js';

describe('SharedResourceManager', (): void => {
  const namespace: NamespaceName = NamespaceName.of('test-namespace');
  const context: string = 'test-context';
  const chartVersion: string = '1.0.0';

  let loggerStub: SoloLogger;
  let helmStub: HelmClient;
  let chartManagerStub: ChartManager;
  let manager: SharedResourceManager;

  beforeEach((): void => {
    loggerStub = sinon.stub() as any;
    loggerStub.info = sinon.stub();
    loggerStub.error = sinon.stub();

    helmStub = sinon.stub() as any;

    chartManagerStub = sinon.stub() as any;
    chartManagerStub.isChartInstalled = sinon.stub().resolves(false);
    chartManagerStub.install = sinon.stub().resolves(true);
    chartManagerStub.uninstall = sinon.stub().resolves(true);

    manager = new SharedResourceManager(loggerStub, helmStub, chartManagerStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('installChart()', (): void => {
    it('skips installation when chart is already installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(true);

      await manager.installChart(namespace, '', chartVersion, context);

      expect(chartManagerStub.install).to.not.have.been.called;
    });

    it('installs chart when not already installed', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      expect(chartManagerStub.install).to.have.been.calledOnce;
    });

    it('uses SOLO_TESTING_CHART_URL when chartDirectory is empty', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const repoName: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[3];
      expect(repoName).to.equal(constants.SOLO_TESTING_CHART_URL);
    });

    it('uses provided chartDirectory when given', async (): Promise<void> => {
      const localDirectory: string = '/local/solo-charts';

      await manager.installChart(namespace, localDirectory, chartVersion, context);

      const repoName: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[3];
      expect(repoName).to.equal(localDirectory);
    });

    it('always passes postgresql.enabled and redis.enabled in values', async (): Promise<void> => {
      manager.enablePostgres();
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set postgresql.enabled=true');
      expect(valuesArgument).to.include('--set redis.enabled=true');
    });

    it('reflects postgres disabled and redis enabled correctly in values', async (): Promise<void> => {
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set postgresql.enabled=false');
      expect(valuesArgument).to.include('--set redis.enabled=true');
    });

    it('merges extra valuesArgumentsMap into the helm --set arguments', async (): Promise<void> => {
      const extraValues: Record<string, string> = {
        'redis.image.registry': constants.REDIS_IMAGE_REGISTRY,
        'redis.sentinel.masterSet': constants.REDIS_SENTINEL_MASTER_SET,
      };

      await manager.installChart(namespace, '', chartVersion, context, extraValues);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set redis.image.registry=gcr.io');
      expect(valuesArgument).to.include('--set redis.sentinel.masterSet=mirror');
    });

    it('installs chart with the correct release name and chart name', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const [, releaseName, chartName] = (chartManagerStub.install as sinon.SinonStub).firstCall.args;
      expect(releaseName).to.equal(constants.SOLO_SHARED_RESOURCES_CHART);
      expect(chartName).to.equal(constants.SOLO_SHARED_RESOURCES_CHART);
    });

    it('passes the correct namespace and context to chartManager.install', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const installedNamespace: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[0];
      const installedContext: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[6];
      expect(installedNamespace).to.equal(namespace);
      expect(installedContext).to.equal(context);
    });
  });

  describe('uninstallChart()', (): void => {
    it('skips uninstallation when chart is not installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(false);

      await manager.uninstallChart(namespace, context);

      expect(chartManagerStub.uninstall).to.not.have.been.called;
    });

    it('uninstalls chart when it is installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(true);

      await manager.uninstallChart(namespace, context);

      expect(chartManagerStub.uninstall).to.have.been.calledOnceWith(
        namespace,
        constants.SOLO_SHARED_RESOURCES_CHART,
        context,
      );
    });
  });

  describe('enablePostgres() / enableRedis()', (): void => {
    it('defaults postgres and redis to disabled', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set postgresql.enabled=false');
      expect(valuesArgument).to.include('--set redis.enabled=false');
    });

    it('enables postgres after calling enablePostgres()', async (): Promise<void> => {
      manager.enablePostgres();

      await manager.installChart(namespace, '', chartVersion, context);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set postgresql.enabled=true');
      expect(valuesArgument).to.include('--set redis.enabled=false');
    });

    it('enables redis after calling enableRedis()', async (): Promise<void> => {
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valuesArgument: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
      expect(valuesArgument).to.include('--set postgresql.enabled=false');
      expect(valuesArgument).to.include('--set redis.enabled=true');
    });
  });
});
