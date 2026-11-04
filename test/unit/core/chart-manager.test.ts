// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ChartManager} from '../../../src/core/chart-manager.js';
import {type Chart} from '../../../src/integration/helm/model/chart.js';
import {type HelmClient} from '../../../src/integration/helm/helm-client.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type InstallChartOptions} from '../../../src/integration/helm/model/install/install-chart-options.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type CacheCatalogStore} from '../../../src/integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../../../src/integration/cache/api/cache-health-inspector.js';
import {ReleaseItem} from '../../../src/integration/helm/model/release/release-item.js';
import {HelmExecutionException} from '../../../src/integration/helm/helm-execution-exception.js';
import {Helpers} from '../../../src/core/helpers.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Duration} from '../../../src/core/time/duration.js';

const inspectorReturning: (present: boolean) => CacheHealthInspector = (present: boolean): CacheHealthInspector =>
  ({
    exists: async (): Promise<boolean> => present,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  }) as CacheHealthInspector;

const helmFailure: (standardError: string) => HelmExecutionException = (
  standardError: string,
): HelmExecutionException =>
  new HelmExecutionException(
    1,
    `Helm command failed with exit code 1. Command: 'helm'. Error: ${standardError}`,
    '',
    standardError,
  );

describe('ChartManager cached-chart consumption', (): void => {
  const chartName: string = 'hedera-mirror';
  const chartVersion: string = 'v0.157.0';
  const repositoryUrl: string = 'https://example.com/charts';
  const cachedArchivePath: string = '/home/user/.solo/cache/charts/hedera-mirror__v0.157.0.tar';

  const logger: SoloLogger = {
    debug: (): void => undefined,
    warn: (): void => undefined,
    showUser: (): void => undefined,
    error: (): void => undefined,
  } as unknown as SoloLogger;

  const chartValues: HelmChartValues = {
    toArguments: (): string[] => [],
    toEnvironment: (): Record<string, string> => ({}),
  } as unknown as HelmChartValues;

  let installChartStub: SinonStub;
  let helm: HelmClient;

  const buildStore: () => CacheCatalogStore = (): CacheCatalogStore =>
    ({resolvePath: (): string => cachedArchivePath}) as unknown as CacheCatalogStore;

  const buildManager: (inspector: CacheHealthInspector) => ChartManager = (
    inspector: CacheHealthInspector,
  ): ChartManager => {
    const manager: ChartManager = new ChartManager(helm, logger, buildStore(), inspector);
    // Short-circuit isChartInstalled so install() always reaches the install branch.
    sinon.stub(manager, 'getInstalledRelease').resolves();
    return manager;
  };

  const runInstall: (manager: ChartManager, repoName?: string) => Promise<InstallChartOptions> = async (
    manager: ChartManager,
    repoName: string = repositoryUrl,
  ): Promise<InstallChartOptions> => {
    await manager.install(
      undefined as unknown as NamespaceName,
      'release-name',
      chartName,
      repoName,
      chartVersion,
      chartValues,
      'kube-context',
    );
    expect(installChartStub).to.have.been.calledOnce;
    return installChartStub.firstCall.args[2] as InstallChartOptions;
  };

  beforeEach((): void => {
    installChartStub = sinon.stub().resolves();
    helm = {installChart: installChartStub} as unknown as HelmClient;
  });

  it('installs from the cached tarball path and omits --version when a cache hit exists', async (): Promise<void> => {
    const options: InstallChartOptions = await runInstall(buildManager(inspectorReturning(true)));

    const chart: Chart = installChartStub.firstCall.args[1] as Chart;
    expect(chart.name).to.equal(cachedArchivePath);
    expect(chart.repoName).to.be.undefined;
    // `helm install` rejects --version for a local chart, so it must not be set.
    expect(options.version).to.be.undefined;
  });

  it('installs from the remote repo with --version when the chart is not cached', async (): Promise<void> => {
    const options: InstallChartOptions = await runInstall(buildManager(inspectorReturning(false)));

    const chart: Chart = installChartStub.firstCall.args[1] as Chart;
    expect(chart.name).to.equal(chartName);
    expect(chart.repoName).to.equal(repositoryUrl);
    expect(options.version).to.equal(chartVersion);
  });

  for (const localChartPath of ['/missing/charts', '~/missing/charts', String.raw`C:\missing\charts`]) {
    it(`never swaps the missing local chart path ${localChartPath} for a cached chart`, async (): Promise<void> => {
      const options: InstallChartOptions = await runInstall(buildManager(inspectorReturning(true)), localChartPath);

      const chart: Chart = installChartStub.firstCall.args[1] as Chart;
      expect(chart.name).to.equal(chartName);
      expect(chart.repoName).to.equal(localChartPath);
      expect(options.version).to.equal(chartVersion);
    });
  }

  it('installs a repo alias from the cached tarball path when a cache hit exists', async (): Promise<void> => {
    await runInstall(buildManager(inspectorReturning(true)), 'mirror');

    const chart: Chart = installChartStub.firstCall.args[1] as Chart;
    expect(chart.name).to.equal(cachedArchivePath);
  });

  it('passes --skip-crds only when requested', async (): Promise<void> => {
    const manager: ChartManager = buildManager(inspectorReturning(false));
    await manager.install(
      undefined as unknown as NamespaceName,
      'release-name',
      chartName,
      repositoryUrl,
      chartVersion,
      chartValues,
      'kube-context',
      false,
      false,
      false,
      true,
    );
    expect((installChartStub.firstCall.args[2] as InstallChartOptions).skipCrds).to.be.true;

    const defaultOptions: InstallChartOptions = await (async (): Promise<InstallChartOptions> => {
      installChartStub.resetHistory();
      return runInstall(manager);
    })();
    expect(defaultOptions.skipCrds).to.be.false;
  });
});

describe('ChartManager installed-release lookup', (): void => {
  const logger: SoloLogger = {
    debug: (): void => undefined,
    showUserError: (): void => undefined,
  } as unknown as SoloLogger;

  const releases: ReleaseItem[] = [
    new ReleaseItem('prometheus', 'solo-setup', '1', '', 'deployed', 'kube-prometheus-stack-52.0.1', 'v0.68.0'),
    new ReleaseItem('metrics-server', 'kube-system', '1', '', 'deployed', 'metrics-server-3.13.1', '0.8.1'),
  ];

  const buildManager: () => ChartManager = (): ChartManager => {
    const helm: HelmClient = {listReleases: sinon.stub().resolves(releases)} as unknown as HelmClient;
    return new ChartManager(
      helm,
      logger,
      undefined as unknown as CacheCatalogStore,
      undefined as unknown as CacheHealthInspector,
    );
  };

  it('returns the release matching the release name with its chart version', async (): Promise<void> => {
    const release: ReleaseItem | undefined = await buildManager().getInstalledRelease(
      undefined as unknown as NamespaceName,
      'prometheus',
    );
    expect(release?.chart).to.equal('kube-prometheus-stack-52.0.1');
    expect(release?.namespace).to.equal('solo-setup');
  });

  it('returns undefined when the release is not installed', async (): Promise<void> => {
    const release: ReleaseItem | undefined = await buildManager().getInstalledRelease(
      undefined as unknown as NamespaceName,
      'absent-release',
    );
    expect(release).to.be.undefined;
  });

  it('returns every installed release, not just one matched by name', async (): Promise<void> => {
    const installedReleases: ReleaseItem[] = await buildManager().getInstalledReleases(
      undefined as unknown as NamespaceName,
    );
    expect(installedReleases).to.deep.equal(releases);
  });

  it('keeps isChartInstalled consistent with the release lookup', async (): Promise<void> => {
    const manager: ChartManager = buildManager();
    expect(await manager.isChartInstalled(undefined as unknown as NamespaceName, 'prometheus')).to.be.true;
    expect(await manager.isChartInstalled(undefined as unknown as NamespaceName, 'absent-release')).to.be.false;
  });
});

describe('ChartManager transient download retry', (): void => {
  const logger: SoloLogger = {
    debug: (): void => undefined,
    warn: (): void => undefined,
  } as unknown as SoloLogger;

  const chartValues: HelmChartValues = {
    toArguments: (): string[] => [],
    toEnvironment: (): Record<string, string> => ({}),
  } as unknown as HelmChartValues;

  const prometheusCrds504: string =
    'Error: INSTALLATION FAILED: failed to fetch https://github.com/prometheus-community/helm-charts/releases/download/prometheus-operator-crds-24.0.2/prometheus-operator-crds-24.0.2.tgz : 504 Gateway Timeout';

  // Helm 3.14.2 stderr, from CI logs and from runs against an unreachable host and a server answering 504/503.
  const transientErrors: string[] = [
    'Error: looks like "https://operator.min.io/" is not a valid chart repository or cannot be reached: Get "https://operator.min.io/index.yaml": dial tcp: lookup operator.min.io: no such host',
    'Error: looks like "https://charts.example.com/" is not a valid chart repository or cannot be reached: failed to fetch https://charts.example.com/index.yaml : 504 Gateway Timeout',
    'Error: looks like "https://charts.example.com/" is not a valid chart repository or cannot be reached: failed to fetch https://charts.example.com/index.yaml : 429 Too Many Requests',
    prometheusCrds504,
    'Error: INSTALLATION FAILED: Get "https://charts.example.com/chart-1.0.0.tgz": read tcp 10.1.0.4:58331->140.82.112.4:443: read: connection reset by peer',
    'Error: INSTALLATION FAILED: failed to do request: Head "https://ghcr.io/v2/hiero-ledger/charts/explorer/manifests/26.0.0": dial tcp: lookup ghcr.io on 10.48.0.10:53: server misbehaving',
    'Error: INSTALLATION FAILED: failed to do request: Head "https://ghcr.io/v2/hiero-ledger/charts/explorer/manifests/26.0.0": dial tcp 140.82.112.33:443: i/o timeout',
    'Error: INSTALLATION FAILED: unexpected status from HEAD request to https://ghcr.io/v2/hiero-ledger/charts/explorer/manifests/26.0.0: 503 Service Unavailable',
  ];

  const settledErrors: string[] = [
    'Error: INSTALLATION FAILED: failed to fetch https://charts.example.com/chart-9.9.9.tgz : 404 Not Found',
    'Error: looks like "https://charts.example.com/" is not a valid chart repository or cannot be reached: failed to fetch https://charts.example.com/index.yaml : 404 Not Found',
    'Error: INSTALLATION FAILED: cannot re-use a name that is still in use',
    'Error: Kubernetes cluster unreachable: Get "https://127.0.0.1:6443/version": dial tcp 127.0.0.1:6443: connect: connection refused',
    // a Kubernetes API failure after the release exists must not run the install again
    'Error: INSTALLATION FAILED: Post "https://kube.example.com:6443/api/v1/namespaces/solo/secrets": dial tcp: lookup kube.example.com: no such host',
  ];

  const buildManager: (helm: HelmClient) => ChartManager = (helm: HelmClient): ChartManager => {
    const manager: ChartManager = new ChartManager(
      helm,
      logger,
      undefined as unknown as CacheCatalogStore,
      {exists: async (): Promise<boolean> => false} as unknown as CacheHealthInspector,
    );
    sinon.stub(manager, 'getInstalledRelease').resolves();
    return manager;
  };

  const sleptMillis: () => number[] = (): number[] =>
    sleepStub.getCalls().map((call: sinon.SinonSpyCall): number => (call.args[0] as Duration).toMillis());

  let sleepStub: SinonStub;

  beforeEach((): void => {
    sleepStub = sinon.stub(Helpers, 'sleep').resolves();
  });

  afterEach((): void => {
    sleepStub.restore();
  });

  for (const standardError of transientErrors) {
    it(`retries helm repo add after: ${standardError}`, async (): Promise<void> => {
      const addRepository: SinonStub = sinon.stub().onFirstCall().rejects(helmFailure(standardError)).resolves();
      const helm: HelmClient = {listRepositories: sinon.stub().resolves([]), addRepository} as unknown as HelmClient;

      expect(await buildManager(helm).addRepo('operator', 'https://operator.min.io/', true)).to.equal(
        'https://operator.min.io/',
      );
      expect(addRepository).to.have.been.calledTwice;
      expect(sleptMillis()).to.deep.equal([2000]);
    });
  }

  for (const standardError of settledErrors) {
    it(`does not retry after: ${standardError}`, async (): Promise<void> => {
      const failure: HelmExecutionException = helmFailure(standardError);
      const addRepository: SinonStub = sinon.stub().rejects(failure);
      const helm: HelmClient = {listRepositories: sinon.stub().resolves([]), addRepository} as unknown as HelmClient;

      const error: unknown = await buildManager(helm)
        .addRepo('charts', 'https://charts.example.com/', true)
        .catch((error_: unknown): unknown => error_);
      expect(error).to.equal(failure);
      expect(addRepository).to.have.been.calledOnce;
      expect(sleepStub).not.to.have.been.called;
    });
  }

  it('retries helm install when the chart download returns 504', async (): Promise<void> => {
    const installChart: SinonStub = sinon.stub().onFirstCall().rejects(helmFailure(prometheusCrds504)).resolves();

    const installed: boolean = await buildManager({installChart} as unknown as HelmClient).install(
      NamespaceName.of('solo'),
      'prometheus-operator-crds',
      'prometheus-operator-crds',
      'prometheus-operator-crds',
      '24.0.2',
      chartValues,
      'kube-context',
    );
    expect(installed).to.be.true;
    expect(installChart).to.have.been.calledTwice;
  });

  it('retries helm upgrade when the chart download returns 504', async (): Promise<void> => {
    const upgradeChart: SinonStub = sinon.stub().onFirstCall().rejects(helmFailure(prometheusCrds504)).resolves();

    const upgraded: boolean = await buildManager({upgradeChart} as unknown as HelmClient).upgrade(
      NamespaceName.of('solo'),
      'explorer-haproxy-ingress',
      'haproxy-ingress',
      'haproxy-ingress',
      '0.14.5',
      chartValues,
      'kube-context',
    );
    expect(upgraded).to.be.true;
    expect(upgradeChart).to.have.been.calledTwice;
  });

  it('gives up after four attempts with a doubling wait and reports the last error', async (): Promise<void> => {
    const installChart: SinonStub = sinon.stub().rejects(helmFailure(prometheusCrds504));

    const error: unknown = await buildManager({installChart} as unknown as HelmClient)
      .install(
        NamespaceName.of('solo'),
        'prometheus-operator-crds',
        'prometheus-operator-crds',
        'prometheus-operator-crds',
        '24.0.2',
        chartValues,
        'kube-context',
      )
      .catch((error_: unknown): unknown => error_);
    expect(error).to.be.instanceOf(SoloErrors.system.helmChartGenericInstallFailed);
    expect((error as Error).message).to.contain('504 Gateway Timeout');
    expect(installChart).to.have.callCount(4);
    expect(sleptMillis()).to.deep.equal([2000, 4000, 8000]);
  });
});
