// SPDX-License-Identifier: Apache-2.0

import {type SemanticVersion} from './base/api/version/semantic-version.js';
import {type Chart} from './model/chart.js';
import {type InstallChartOptions} from './model/install/install-chart-options.js';
import {type UpgradeChartOptions} from './model/upgrade/upgrade-chart-options.js';
import {type Release} from './model/chart/release.js';
import {type Repository} from './model/repository.js';
import {type ReleaseItem} from './model/release/release-item.js';
import {type TestChartOptions} from './model/test/test-chart-options.js';
import {type UnInstallChartOptions} from './model/install/un-install-chart-options.js';
import {type AddRepoOptions} from './model/add/add-repo-options.js';

/**
 * The HelmClient is a bridge between TypeScript and the Helm CLI. The client is highly dependent on specific features
 * and versions of the Helm CLI tools; therefore, all implementations are expected to provide a packaged Helm executable
 * of the appropriate version for each supported OS and architecture.
 */
export interface HelmClient {
  /**
   * Executes the Helm CLI version sub-command and returns the reported version.
   *
   * @returns the version of the Helm CLI that is being used by this client.
   */
  version(): Promise<SemanticVersion>;

  /**
   * Executes the Helm CLI repo list sub-command and returns the list of repositories.
   *
   * @returns the list of repositories.
   */
  listRepositories(): Promise<Repository[]>;

  /**
   * Executes the Helm CLI repo add sub-command and adds a new repository.
   *
   * @param repository the repository to add.
   * @param options the options to pass to the Helm CLI command.
   * @throws Error if name or url is null or blank.
   * @throws HelmExecutionException if the Helm CLI command fails.
   * @throws HelmParserException if the output of the Helm CLI command cannot be parsed.
   */
  addRepository(repository: Repository, options?: AddRepoOptions): Promise<void>;

  /**
   * Executes the Helm CLI repo remove sub-command and removes a repository.
   *
   * @param repository the repository to remove.
   */
  removeRepository(repository: Repository): Promise<void>;

  /**
   * Executes the Helm CLI install sub-command and installs a Helm chart passing the flags and arguments
   * provided.
   *
   * @param releaseName the name of the release.
   * @param chart the Helm chart to install.
   * @param options the options to pass to the Helm CLI command.
   * @returns the Release that was installed.
   */
  installChart(releaseName: string, chart: Chart, options: InstallChartOptions): Promise<Release>;

  /**
   * Executes the Helm CLI upgrade sub-command and upgrades a Helm chart.
   *
   * @param releaseName the name of the release.
   * @param chart the Helm chart to upgrade.
   * @param options the options to pass to the Helm CLI command.
   * @returns the Release that was upgraded.
   */
  upgradeChart(releaseName: string, chart: Chart, options: UpgradeChartOptions): Promise<Release>;

  /**
   * Executes the Helm CLI uninstall sub-command and uninstalls the specified Helm chart.
   *
   * @param releaseName the name of the release to uninstall.
   * @param options the options to pass to the Helm CLI command.
   */
  uninstallChart(releaseName: string, options: UnInstallChartOptions): Promise<void>;

  /**
   * Executes the Helm CLI test sub-command and tests the specified Helm chart.
   *
   * @param releaseName the name of the release to test.
   * @param options the options to pass to the Helm CLI command.
   */
  testChart(releaseName: string, options: TestChartOptions): Promise<void>;

  /**
   * Executes the Helm CLI list sub-command and returns the list of releases.
   * @param allNamespaces if true, list releases across all namespaces.
   * @param namespace the namespace to list releases from. Only used if allNamespaces is false.
   * @param kubeContext
   * @returns the list of releases.
   */
  listReleases(allNamespaces: boolean, namespace?: string, kubeContext?: string): Promise<ReleaseItem[]>;

  /**
   * Executes the Helm CLI dependency update sub-command and updates the dependencies of the specified Helm
   * chart.
   *
   * @param chartName the name of the chart to update.
   */
  dependencyUpdate(chartName: string): Promise<void>;
}
