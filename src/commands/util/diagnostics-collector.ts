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
import {type ClusterReachability} from './cluster-reachability.js';

/**
 * Node-level network error codes that indicate the API server could not be
 * contacted at all (as opposed to the server responding with an HTTP error).
 */
const CONNECTIVITY_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ECONNRESET',
  'ECONNABORTED',
  'EAI_AGAIN',
  'EPIPE',
]);

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
   * Only genuine connectivity failures (no API server response) count as unreachable.
   * If the server responds with an error (for example an authorization failure, which
   * carries an HTTP status code), the cluster is reachable and the caller proceeds with
   * normal remote collection so the real error surfaces rather than being hidden behind
   * a silent local-only fallback.
   *
   * The diagnostics commands use this to degrade to local-only collection instead of
   * hard-failing, which is the common situation right after a cluster is deleted.
   */
  public static async isKubeClusterReachable(k8Factory: K8Factory): Promise<ClusterReachability> {
    let k8: K8;
    try {
      k8 = k8Factory.default();
    } catch (error) {
      // The default client could not be constructed: no active context/cluster in the
      // kubeconfig, or an unreadable/invalid kubeconfig. Either way a cluster cannot be
      // reached, so degrade — surfacing the actual error rather than assuming a cause.
      return {reachable: false, reason: (error as Error)?.message || 'no active Kubernetes context'};
    }

    if (!k8.contexts().readCurrent()) {
      return {reachable: false, reason: 'no active Kubernetes context'};
    }

    try {
      // A successful API call confirms the cluster answers.
      await k8.namespaces().list();
      return {reachable: true};
    } catch (error) {
      if (DiagnosticsCollector.isConnectivityFailure(error)) {
        return {reachable: false, reason: (error as Error).message};
      }

      // The server responded (e.g. an authorization error carries an HTTP status code):
      // the cluster is reachable, so do not degrade — let the normal path surface the error.
      return {reachable: true};
    }
  }

  /**
   * Returns true only when the error indicates the API server could not be contacted
   * (a node network error such as connection refused), walking the `cause` chain. An
   * error that carries a numeric HTTP status code means the server responded and is
   * therefore treated as reachable.
   */
  private static isConnectivityFailure(error: unknown): boolean {
    for (let current: unknown = error; current; current = (current as {cause?: unknown}).cause) {
      const code: unknown = (current as {code?: unknown}).code;
      if (typeof code === 'number') {
        return false;
      }
      if (typeof code === 'string' && CONNECTIVITY_ERROR_CODES.has(code)) {
        return true;
      }
    }

    // Could not positively identify a connectivity failure: assume the server is
    // reachable so the real error is surfaced rather than hidden by a local fallback.
    return false;
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
