// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type K8} from '../../integration/kube/k8.js';
import {type Contexts} from '../../integration/kube/resources/context/contexts.js';
import {type ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';

/**
 * Sanitize a string for safe use as a filename on all platforms.
 * Replaces characters invalid on Windows with underscores.
 */
function sanitizeFilename(input: string): string {
  return input.replaceAll(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Scan all kubeconfig contexts for solo remote-config ConfigMaps and return a map of
 * deployment name → namespace.  Contexts that are unreachable are skipped with a warning.
 */
export async function findDeploymentsFromRemoteConfig(
  k8Factory: K8Factory,
  logger: SoloLogger,
): Promise<Map<string, string>> {
  const deploymentNamespaceMap: Map<string, string> = new Map<string, string>();
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
                deploymentNamespaceMap.set(deployment, configMap.namespace.name);
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
  return deploymentNamespaceMap;
}

export class RemoteConfigCollector {
  public constructor(
    private readonly k8Factory: K8Factory,
    private readonly logger: SoloLogger,
  ) {}

  public async collect(customOutputDirectory: string = ''): Promise<string> {
    const outputDirectory: string = customOutputDirectory
      ? path.resolve(customOutputDirectory, 'remote-config')
      : PathEx.join(constants.SOLO_LOGS_DIR, 'remote-config');
    fs.mkdirSync(outputDirectory, {recursive: true});

    const contexts: Contexts = this.k8Factory.default().contexts();
    for (const context of contexts.list()) {
      const k8: K8 = this.k8Factory.getK8(context);
      try {
        const configMaps: ConfigMap[] = await k8
          .configMaps()
          .listForAllNamespaces([constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR]);

        for (const configMap of configMaps) {
          const namespace: string = configMap.namespace.name;
          const outputFileName: string = `${sanitizeFilename(context)}-${sanitizeFilename(namespace)}-${sanitizeFilename(configMap.name)}.json`;
          const outputFilePath: string = PathEx.join(outputDirectory, outputFileName);

          fs.writeFileSync(
            outputFilePath,
            JSON.stringify(this.toSerializableConfigMap(configMap), undefined, 2),
            'utf8',
          );
          this.logger.info(`Saved solo-remote-config for ${context}/${namespace} to ${outputFilePath}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to get solo-remote-config in context ${context}: ${(error as Error).message}`);
      }
    }

    return outputDirectory;
  }

  private toSerializableConfigMap(configMap: ConfigMap): Record<string, unknown> {
    const output: Record<string, unknown> = {
      name: configMap.name,
      namespace: configMap.namespace.name,
      labels: configMap.labels ?? {},
      data: {} as Record<string, unknown>,
    };

    if (configMap.data) {
      for (const [key, value] of Object.entries(configMap.data)) {
        try {
          (output.data as Record<string, unknown>)[key] = JSON.parse(value);
        } catch {
          (output.data as Record<string, unknown>)[key] = value;
        }
      }
    }

    return output;
  }
}
