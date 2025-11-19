// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../core/constants.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {Templates} from '../../core/templates.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type SoloListrTask} from '../../types/index.js';
import {SoloError} from '../../core/errors/solo-error.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';

interface ConfigOpsLogsContext {
  outputDirectory: string;
}

interface NodePodInfo {
  type: 'mirror' | 'relay' | 'explorer';
  pod: Pod;
  context: string;
  namespace: NamespaceName;
}

@injectable()
export class ConfigCommandTasks {
  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
  ) {}

  public downloadNonConsensusNodeLogs(): SoloListrTask<ConfigOpsLogsContext> {
    return {
      title: 'Download logs from non-consensus nodes',
      task: async (context_, task) => {
        // Find all solo-remote-config configmaps across all namespaces
        const k8 = this.k8Factory.default();
        const configMaps = await k8.configMaps().listForAllNamespaces([]);
        const remoteConfigMaps = configMaps.filter(cm => cm.name === 'solo-remote-config');
        this.logger.info(`Found ${remoteConfigMaps.length} solo-remote-config configmaps`);

        // Process each remote config to discover deployments and their clusters
        const allDeploymentInfo: Array<{
          deploymentName: string;
          namespace: NamespaceName;
          context: string;
          clusters: string[];
        }> = [];

        for (const configMap of remoteConfigMaps) {
          try {
            this.logger.info(`Loading remote config from namespace: ${configMap.namespace}`);

            // Load remote config from this configmap
            const remoteConfig = this.remoteConfig;
            await remoteConfig.populateFromExisting(configMap.namespace, k8.contexts().readCurrent());

            if (remoteConfig.isLoaded()) {
              // Get deployment information from remote config
              const clusters = remoteConfig.configuration?.clusters || [];

              for (const cluster of clusters) {
                const deploymentName = cluster.deployment;
                const namespace = NamespaceName.of(cluster.namespace);
                const contextName = cluster.name;

                this.logger.info(
                  `Found deployment: ${deploymentName} in namespace: ${namespace} (context: ${contextName})`,
                );

                allDeploymentInfo.push({
                  deploymentName,
                  namespace,
                  context: contextName,
                  clusters: [contextName],
                });
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to load remote config from namespace ${configMap.namespace}: ${error}`);
          }
        }

        // Verify we found some deployments
        if (allDeploymentInfo.length === 0) {
          throw new SoloError('No deployments found in remote configuration');
        }

        this.logger.info(`Found ${allDeploymentInfo.length} deployment(s) from remote config`);

        // Create output directory structure
        const outputDirectory = path.join(constants.SOLO_LOGS_DIR, 'non-consensus-logs');
        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }

        const allPods: NodePodInfo[] = [];

        // Iterate through each deployment from remote config
        for (const deploymentInfo of allDeploymentInfo) {
          const {deploymentName, namespace, context, clusters} = deploymentInfo;

          this.logger.info(`Processing deployment: ${deploymentName} in namespace: ${namespace}`);
          this.logger.info(`Discovering non-consensus node pods in context: ${context}...`);

          try {
            // Find mirror node pods
            const mirrorPods = await this.findMirrorNodePods(context, namespace);
            allPods.push(...mirrorPods.map(pod => ({type: 'mirror' as const, ...pod})));

            // Find relay node pods
            const relayPods = await this.findRelayNodePods(context, namespace);
            allPods.push(...relayPods.map(pod => ({type: 'relay' as const, ...pod})));

            // Find explorer node pods
            const explorerPods = await this.findExplorerNodePods(context, namespace);
            allPods.push(...explorerPods.map(pod => ({type: 'explorer' as const, ...pod})));
          } catch (error) {
            this.logger.warn(`Failed to check context ${context}: ${error}`);
          }
        }

        if (allPods.length === 0) {
          this.logger.info('No non-consensus node pods found');
          return;
        }

        this.logger.info(`Found ${allPods.length} non-consensus node pods`);

        // Download logs from each pod
        for (const podInfo of allPods) {
          await this.downloadPodLogs(podInfo, outputDirectory);
        }

        task.title = `Downloaded logs from ${allPods.length} non-consensus node pods`;
      },
    };
  }

  private async findMirrorNodePods(
    context: string,
    namespace: NamespaceName,
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(context);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Use Templates.renderMirrorNodeLabels for consistent label generation
      const mirrorLabels = Templates.renderMirrorNodeLabels(1);

      const mirrorPods = await k8.pods().list(namespace, mirrorLabels);
      for (const pod of mirrorPods) {
        pods.push({pod, context: context, namespace});
      }
    } catch (error) {
      this.logger.info(`No mirror node pods found in cluster ${context}: ${error}`);
    }

    return pods;
  }

  private async findRelayNodePods(
    context: string,
    namespace: NamespaceName,
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(context);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Use Templates.renderRelayLabels for consistent label generation
      const relayLabels = Templates.renderRelayLabels(1);

      const relayPods = await k8.pods().list(namespace, relayLabels);
      for (const pod of relayPods) {
        pods.push({pod, context: context, namespace});
      }
    } catch (error) {
      this.logger.info(`No relay node pods found in cluster ${context}: ${error}`);
    }

    return pods;
  }

  private async findExplorerNodePods(
    context: string,
    namespace: NamespaceName,
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(context);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Use Templates.renderExplorerLabels for consistent label generation
      const explorerLabels = Templates.renderExplorerLabels(1);

      const explorerPods = await k8.pods().list(namespace, explorerLabels);
      for (const pod of explorerPods) {
        pods.push({pod, context: context, namespace});
      }
    } catch (error) {
      this.logger.info(`No explorer node pods found in cluster ${context}: ${error}`);
    }

    return pods;
  }

  private async downloadPodLogs(podInfo: NodePodInfo, outputDirectory: string): Promise<void> {
    const {type, pod, context, namespace} = podInfo;
    const podName = pod.podReference.name.name;

    this.logger.info(`Downloading logs from ${type} pod: ${podName} (cluster: ${context})`);

    try {
      const k8 = this.k8Factory.getK8(context);

      // Create directory for this pod's logs
      const podLogDir = path.join(outputDirectory, context, type, podName);
      if (!fs.existsSync(podLogDir)) {
        fs.mkdirSync(podLogDir, {recursive: true});
      }

      // Get logs using kubectl with output to file (avoids buffer issues)
      const logFile = path.join(podLogDir, `${podName}.log`);
      const logCommand = `kubectl logs ${podName} -n ${namespace.toString()} --all-containers=true --timestamps=true > "${logFile}" 2>&1`;

      this.logger.info(`Downloading logs for pod ${podName}...`);

      try {
        execSync(logCommand, {encoding: 'utf8', cwd: process.cwd(), shell: '/bin/bash', maxBuffer: 1024 * 1024 * 100}); // 100MB buffer
        this.logger.info(`Saved logs to ${logFile}`);
      } catch {
        // Try without all-containers flag if that fails
        const simpleLogCommand = `kubectl logs ${podName} -n ${namespace.toString()} --timestamps=true > "${logFile}" 2>&1`;
        execSync(simpleLogCommand, {encoding: 'utf8', cwd: process.cwd(), shell: '/bin/bash', maxBuffer: 1024 * 1024 * 100});
        this.logger.info(`Saved logs to ${logFile}`);
      }
    } catch (error) {
      this.logger.error(`Failed to download logs from ${type} pod ${podName}: ${error}`);
      // Continue with other pods even if one fails
    }
  }
}
