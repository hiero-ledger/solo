// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import * as constants from '../../core/constants.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type RemoteDeploymentInfo} from './remote-deployment-info.js';

/**
 * Scan all kubeconfig contexts for solo remote-config ConfigMaps and return a map of
 * deployment name -> {namespace, context}. Contexts that are unreachable are skipped with a
 * warning. If the same deployment name appears in more than one context, the entry is removed
 * from the map and the caller receives a warning so it can ask the user to disambiguate via
 * --deployment / --context flags.
 */
export async function findDeploymentsFromRemoteConfig(
  k8Factory: K8Factory,
  logger: SoloLogger,
): Promise<Map<string, RemoteDeploymentInfo>> {
  const deploymentMap: Map<string, RemoteDeploymentInfo> = new Map();
  /** Tracks deployment names that appear in more than one context so we can drop them. */
  const ambiguousNames: Set<string> = new Set();

  const contextList: string[] = k8Factory.default().contexts().list();
  for (const context of contextList) {
    try {
      const configMaps: ConfigMap[] = await k8Factory
        .getK8(context)
        .configMaps()
        .listForAllNamespaces([constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR]);
      for (const configMap of configMaps) {
        try {
          if (!configMap.data?.[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]) {
            logger.debug(
              `Skipping ConfigMap ${configMap.name} in ${context}/${configMap.namespace.name}: missing remote config data key`,
            );
            continue;
          }

          const remoteConfigData: Record<string, unknown> = yaml.parse(
            configMap.data[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY],
          ) as Record<string, unknown>;
          const clusters: unknown = remoteConfigData.clusters;
          if (Array.isArray(clusters)) {
            for (const cluster of clusters) {
              const deployment: unknown = (cluster as Record<string, unknown>).deployment;
              if (deployment && typeof deployment === 'string') {
                if (deploymentMap.has(deployment)) {
                  const existing: RemoteDeploymentInfo = deploymentMap.get(deployment)!;
                  if (existing.context !== context) {
                    logger.warn(
                      `Deployment "${deployment}" found in multiple contexts (${existing.context} and ${context}). ` +
                        'It will be excluded from automatic selection — please provide --deployment and --context explicitly.',
                    );
                    ambiguousNames.add(deployment);
                  }
                } else {
                  deploymentMap.set(deployment, {namespace: configMap.namespace.name, context});
                }
              }
            }
          }
        } catch (configMapError) {
          logger.warn(
            `Failed to parse remote config in ConfigMap ${configMap.name} (${context}/${configMap.namespace.name}): ${(configMapError as Error).message}`,
          );
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan remote config in context ${context}: ${(error as Error).message}`);
    }
  }

  for (const name of ambiguousNames) {
    deploymentMap.delete(name);
  }

  return deploymentMap;
}
