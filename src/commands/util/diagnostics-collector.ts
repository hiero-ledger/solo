// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import chalk from 'chalk';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8} from '../../integration/kube/k8.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type AnyListrContext} from '../../types/aliases.js';
import {type SoloListrTask} from '../../types/index.js';

/**
 * Utility class for collecting the diagnostics that are available locally
 * without a Kubernetes cluster connection (the Solo log files and the local
 * configuration). Used as a graceful fallback for the `deployment diagnostics`
 * commands when there is no active kube context, for example right after a
 * cluster-creation failure.
 */
export class DiagnosticsCollector {
  /**
   * Determines whether the current Kubernetes cluster is reachable, without throwing.
   *
   * Verifies both that a current context is configured and that the cluster actually
   * answers an API call. A stale context that still points at a torn-down cluster
   * (connection refused) counts as unreachable — checking only for a context name is
   * not enough, since the kubeconfig entry outlives the cluster.
   *
   * The diagnostics commands use this to degrade to local-only collection instead of
   * hard-failing, which is the common situation right after a cluster is deleted.
   */
  public static async isKubeClusterReachable(k8Factory: K8Factory): Promise<boolean> {
    try {
      const k8: K8 = k8Factory.default();
      if (!k8.contexts().readCurrent()) {
        return false;
      }

      // Confirm the cluster actually answers; a stale context for a deleted cluster
      // throws here (e.g. connection refused) and must be treated as unreachable.
      await k8.namespaces().list();
      return true;
    } catch {
      // No usable/reachable cluster (missing context, connection refused, auth failure, ...).
      return false;
    }
  }

  /**
   * Builds a Listr task that copies the locally available diagnostics artifacts
   * (the Solo log files and the local configuration) into the output directory.
   */
  public static collectLocalDiagnostics(logger: SoloLogger, outputDirectory: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Collect locally available diagnostics',
      task: async (): Promise<void> => {
        const targetDirectory: string = outputDirectory || constants.SOLO_LOGS_DIR;
        if (!fs.existsSync(targetDirectory)) {
          fs.mkdirSync(targetDirectory, {recursive: true});
        }

        const localArtifacts: {source: string; label: string}[] = [
          {source: PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log'), label: 'solo.log'},
          {source: PathEx.join(constants.SOLO_LOGS_DIR, 'solo.ndjson'), label: 'solo.ndjson'},
          {
            source: PathEx.join(constants.SOLO_HOME_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE),
            label: constants.DEFAULT_LOCAL_CONFIG_FILE,
          },
        ];

        let collectedCount: number = 0;
        for (const artifact of localArtifacts) {
          if (!fs.existsSync(artifact.source)) {
            logger.debug(`Local diagnostics artifact not found, skipping: ${artifact.source}`);
            continue;
          }

          const destination: string = PathEx.join(targetDirectory, artifact.label);
          if (PathEx.resolve(artifact.source) === PathEx.resolve(destination)) {
            // Already in place (the default output directory is the logs directory).
            collectedCount++;
            continue;
          }

          try {
            fs.cpSync(artifact.source, destination, {force: true});
            logger.showUser(`  Collected ${artifact.label}`);
            collectedCount++;
          } catch (error) {
            logger.warn(`Failed to collect ${artifact.label}: ${(error as Error).message}`);
          }
        }

        if (collectedCount === 0) {
          logger.showUser(chalk.yellow('  No local diagnostics artifacts were found to collect.'));
        }
      },
    };
  }
}
