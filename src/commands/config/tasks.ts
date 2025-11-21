// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../core/constants.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {Templates} from '../../core/templates.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type SoloListrTask} from '../../types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../../integration/kube/k8.js';

interface ConfigOpsLogsContext {
  outputDirectory: string;
}

interface NodePodInfo {
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

  public downloadNonConsensusNodeLogs(customOutputDir: string = ''): SoloListrTask<ConfigOpsLogsContext> {
    return {
      title: 'Download logs from non-consensus nodes',
      task: async (context_, task) => {
        // Iterate all k8 contexts to find solo-remote-config configmaps
        this.logger.info('Discovering non-consensus nodes from remote configuration...');
        const contexts: ReturnType<ReturnType<typeof this.k8Factory.default>['contexts']> = this.k8Factory
          .default()
          .contexts();
        const allPods: NodePodInfo[] = [];

        // Define component types and their label selectors
        const componentLabelConfigs: Array<{name: string; labels: string[]}> = [
          {name: 'mirror importer', labels: [constants.SOLO_MIRROR_IMPORTER_NAME_LABEL]},
          {name: 'mirror grpc', labels: [constants.SOLO_MIRROR_GRPC_NAME_LABEL]},
          {name: 'mirror monitor', labels: [constants.SOLO_MIRROR_MONITOR_NAME_LABEL]},
          {name: 'mirror rest', labels: [constants.SOLO_MIRROR_REST_NAME_LABEL]},
          {name: 'mirror web3', labels: [constants.SOLO_MIRROR_WEB3_NAME_LABEL]},
          {name: 'mirror postgres', labels: [constants.SOLO_MIRROR_POSTGRES_NAME_LABEL]},
          {name: 'mirror redis', labels: [constants.SOLO_MIRROR_REDIS_NAME_LABEL]},
          {name: 'mirror rest-java', labels: [constants.SOLO_MIRROR_RESTJAVA_NAME_LABEL]},
          {name: 'relay node', labels: [constants.SOLO_RELAY_NAME_LABEL]},
          {name: 'explorer', labels: [constants.SOLO_EXPLORER_LABEL]},
          {name: 'block node', labels: [constants.SOLO_BLOCK_NODE_NAME_LABEL]},
          {name: 'ingress controller', labels: [constants.SOLO_INGRESS_CONTROLLER_NAME_LABEL]},
        ];

        for (const context of contexts.list()) {
          const k8: K8 = this.k8Factory.getK8(context);
          
          try {
            this.logger.info(`Discovering non-consensus node pods in context: ${context}...`);

            // Iterate through each component type and discover pods
            for (const config of componentLabelConfigs) {
              const pods: Pod[] = await k8.pods().listForAllNamespaces(config.labels);
              this.logger.info(`Found ${pods.length} ${config.name} pod(s) in context ${context}`);
              
              for (const pod of pods) {
                allPods.push({
                  pod,
                  context: context,
                  namespace: pod.podReference.namespace,
                });
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to discover pods in context ${context}: ${error}`);
          }
        }

        // Create output directory structure - use custom dir if provided, otherwise use default
        const outputDirectory: string = customOutputDir 
          ? path.resolve(customOutputDir)
          : path.join(constants.SOLO_LOGS_DIR, 'non-consensus-logs');
        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }
        
        this.logger.info(`Logs will be saved to: ${outputDirectory}`);

        this.logger.info(`Found ${allPods.length} non-consensus node pods`);

        // Download logs from each pod
        for (const podInfo of allPods) {
          await this.downloadPodLogs(podInfo, outputDirectory);
        }

        task.title = `Downloaded logs from ${allPods.length} non-consensus node pods`;
      },
    };
  }

  private async downloadPodLogs(podInfo: NodePodInfo, outputDirectory: string): Promise<void> {
    const {pod, context, namespace}: NodePodInfo = podInfo;
    const podName: string = pod.podReference.name.name;

    this.logger.info(`Downloading logs from pod: ${podName} (cluster: ${context})`);

    try {
      // Create directory for this pod's logs
      const podLogDirectory: string = path.join(outputDirectory, context);
      if (!fs.existsSync(podLogDirectory)) {
        fs.mkdirSync(podLogDirectory, {recursive: true});
      }

      // Get logs using kubectl with output to file (avoids buffer issues)
      const logFile: string = path.join(podLogDirectory, `${podName}.log`);
      const logCommand: string = `kubectl logs ${podName} -n ${namespace.toString()} --all-containers=true --timestamps=true > "${logFile}" 2>&1`;

      this.logger.info(`Downloading logs for pod ${podName}...`);

      try {
        execSync(logCommand, {encoding: 'utf8', cwd: process.cwd(), shell: '/bin/bash', maxBuffer: 1024 * 1024 * 100}); // 100MB buffer
        this.logger.info(`Saved logs to ${logFile}`);
      } catch {
        // Try without all-containers flag if that fails
        const simpleLogCommand: string = `kubectl logs ${podName} -n ${namespace.toString()} --timestamps=true > "${logFile}" 2>&1`;
        execSync(simpleLogCommand, {
          encoding: 'utf8',
          cwd: process.cwd(),
          shell: '/bin/bash',
          maxBuffer: 1024 * 1024 * 100,
        });
        this.logger.info(`Saved logs to ${logFile}`);
      }
    } catch (error) {
      this.logger.error(`Failed to download logs from pod ${podName}: ${error}`);
      // Continue with other pods even if one fails
    }
  }
}
