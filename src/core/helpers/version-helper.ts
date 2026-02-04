// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../errors/solo-error.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {execSync} from 'node:child_process';
import * as crypto from 'node:crypto';

/**
 * Helper class for fetching latest versions of components from Helm charts and OCI registries
 */
export class VersionHelper {
  /**
   * Fetches the latest version of a Helm chart from a repository
   * @param logger - The logger instance
   * @param chartUrl - The Helm chart repository URL
   * @param chartName - The name of the chart
   * @returns The latest version string
   */
  public static async fetchLatestVersion(logger: SoloLogger, chartUrl: string, chartName: string): Promise<string> {
    try {
      logger.debug(`Fetching latest version for chart: ${chartName} from ${chartUrl}`);

      // For OCI registries, we need to use a different approach
      if (chartUrl.startsWith('oci://')) {
        return await this.fetchLatestVersionFromOCI(logger, chartUrl, chartName);
      }

      // For HTTP(S) repositories, use helm search repo
      return await this.fetchLatestVersionFromRepo(logger, chartUrl, chartName);
    } catch (error) {
      throw new SoloError(`Failed to fetch latest version for ${chartName}: ${error.message}`, error);
    }
  }

  /**
   * Fetches the latest version from an OCI registry
   * For OCI registries, we use helm show chart to get the version
   */
  private static async fetchLatestVersionFromOCI(
    logger: SoloLogger,
    chartUrl: string,
    chartName: string,
  ): Promise<string> {
    try {
      logger.debug(`Fetching version from OCI registry: ${chartUrl}/${chartName}`);

      // For OCI registries, we use helm show chart which defaults to latest
      const fullChartPath: string = `${chartUrl}/${chartName}`;
      const command: string = `helm show chart ${fullChartPath} 2>&1`;

      logger.debug(`Executing: ${command}`);
      const output: string = execSync(command, {encoding: 'utf8', stdio: 'pipe'});

      // Parse YAML output to extract version
      const versionMatch: RegExpMatchArray | null = output.match(/^version:\s*(.+)$/m);
      if (versionMatch && versionMatch[1]) {
        const version: string = versionMatch[1].trim();
        logger.debug(`Found version from OCI registry: ${version}`);
        return version;
      }

      throw new SoloError(`Could not parse version from helm show chart output for ${fullChartPath}`);
    } catch (error) {
      throw new SoloError(`Failed to fetch version from OCI registry ${chartUrl}: ${error.message}`, error);
    }
  }

  /**
   * Fetches the latest version from a standard Helm repository
   */
  private static async fetchLatestVersionFromRepo(
    logger: SoloLogger,
    chartUrl: string,
    chartName: string,
  ): Promise<string> {
    const temporaryRepoName: string = `solo-temp-${crypto.randomBytes(8).toString('hex')}`;

    try {
      logger.debug(`Adding temporary Helm repo: ${temporaryRepoName} -> ${chartUrl}`);

      // Add the repository temporarily
      const addRepoCommand: string = `helm repo add ${temporaryRepoName} ${chartUrl} 2>&1`;
      execSync(addRepoCommand, {encoding: 'utf8', stdio: 'pipe'});

      // Update the repository
      const updateCommand: string = `helm repo update ${temporaryRepoName} 2>&1`;
      execSync(updateCommand, {encoding: 'utf8', stdio: 'pipe'});

      // Search for the chart and get all versions
      const searchCommand: string = `helm search repo ${temporaryRepoName}/${chartName} --versions -o json 2>&1`;
      logger.debug(`Executing: ${searchCommand}`);
      const searchOutput: string = execSync(searchCommand, {encoding: 'utf8', stdio: 'pipe'});

      // Parse JSON output
      const results: Array<{name: string; version: string; app_version: string}> = JSON.parse(searchOutput);

      if (!results || results.length === 0) {
        throw new SoloError(`No versions found for chart ${chartName} in repository ${chartUrl}`);
      }

      // The first result is the latest version
      const latestVersion: string = results[0].version;
      logger.debug(`Found latest version: ${latestVersion}`);

      return latestVersion;
    } catch (error) {
      throw new SoloError(
        `Failed to fetch version from Helm repository ${chartUrl} for chart ${chartName}: ${error.message}`,
        error,
      );
    } finally {
      // Clean up: remove the temporary repository
      try {
        const removeRepoCommand: string = `helm repo remove ${temporaryRepoName} 2>&1`;
        execSync(removeRepoCommand, {encoding: 'utf8', stdio: 'pipe'});
        logger.debug(`Removed temporary Helm repo: ${temporaryRepoName}`);
      } catch (cleanupError) {
        logger.warn(`Failed to remove temporary Helm repo ${temporaryRepoName}: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Fetches the latest version from builds.hedera.com for consensus nodes
   * @param logger - The logger instance
   * @returns The latest consensus node version
   */
  public static async fetchLatestConsensusNodeVersion(logger: SoloLogger): Promise<string> {
    try {
      logger.debug('Fetching latest consensus node version from builds.hedera.com');

      // Query the builds.hedera.com index to find the latest version
      // The structure is: https://builds.hedera.com/node/software/v{major}.{minor}/
      // We need to query the API or scrape the page to find available versions

      // For now, we'll use a simpler approach: try to fetch a known index endpoint
      // This would need to be updated based on the actual API structure of builds.hedera.com

      throw new SoloError(
        'Consensus node version detection from builds.hedera.com not yet implemented. ' +
          'Please specify the version explicitly using --upgrade-version flag.',
      );
    } catch (error) {
      throw new SoloError(`Failed to fetch latest consensus node version: ${error.message}`, error);
    }
  }
}
