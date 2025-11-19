// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../core/constants.js';
import {Flags as flags} from '../flags.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {Templates} from '../../core/templates.js';
import {PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type SoloListrTask} from '../../types/index.js';
import {SoloError} from '../../core/errors/solo-error.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {type DeploymentName} from '../../types/index.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';

interface ConfigOpsLogsContext {
  deployment?: string;
  namespace: NamespaceName;
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
  ) {}

  public downloadNonConsensusNodeLogs(): SoloListrTask<ConfigOpsLogsContext> {
    return {
      title: 'Download logs from non-consensus nodes',
      task: async (context_, task) => {
        // Initialize context with default values
        const deployment = context_.deployment || this.configManager.getFlag<DeploymentName>(flags.deployment);
        const namespace = context_.namespace || this.configManager.getFlag<NamespaceName>(flags.namespace);

        // Since deployment is now required, validate it's present
        if (!deployment) {
          throw new SoloError('Deployment name is required. Use --deployment <deployment-name> flag.');
        }
        
        // Create output directory structure
        const outputDirectory = path.join(constants.SOLO_LOGS_DIR, 'non-consensus-logs');
        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }

        this.logger.info(`Discovering non-consensus node pods across all clusters...`);
        
        // Get all available clusters/contexts
        const clusters = this.k8Factory.default().clusters().list();
        const allPods: NodePodInfo[] = [];

        // Iterate through all clusters to find non-consensus node pods
        for (const cluster of clusters) {
          this.logger.info(`Checking cluster: ${cluster}`);
          
          try {
            // Find mirror node pods
            const mirrorPods = await this.findMirrorNodePods(cluster, namespace, deployment);
            allPods.push(...mirrorPods.map(pod => ({type: 'mirror' as const, ...pod})));

            // Find relay node pods  
            const relayPods = await this.findRelayNodePods(cluster, namespace, deployment);
            allPods.push(...relayPods.map(pod => ({type: 'relay' as const, ...pod})));

            // Find explorer node pods
            const explorerPods = await this.findExplorerNodePods(cluster, namespace, deployment);
            allPods.push(...explorerPods.map(pod => ({type: 'explorer' as const, ...pod})));

          } catch (error) {
            this.logger.warn(`Failed to check cluster ${cluster}: ${error}`);
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
    cluster: string, 
    namespace: NamespaceName, 
    deployment?: string
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(cluster);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Find postgres pods (part of mirror node)
      const postgresPods = await k8.pods().list(namespace, ['app.kubernetes.io/name=postgres']);
      for (const pod of postgresPods) {
        pods.push({pod, context: cluster, namespace});
      }

      // Find mirror ingress pods
      if (deployment) {
        const ingressPods = await k8.pods().list(namespace, [`app.kubernetes.io/instance=${deployment}-ingress`]);
        for (const pod of ingressPods) {
          if (pod?.podReference?.name?.name?.startsWith('mirror-ingress')) {
            pods.push({pod, context: cluster, namespace});
          }
        }
      }

      // Find mirror node main pods
      const mirrorLabels = deployment 
        ? [`app.kubernetes.io/instance=${deployment}`]
        : ['app.kubernetes.io/name=hiero-mirror-node'];
      
      const mirrorPods = await k8.pods().list(namespace, mirrorLabels);
      for (const pod of mirrorPods) {
        pods.push({pod, context: cluster, namespace});
      }

    } catch (error) {
      this.logger.debug(`No mirror node pods found in cluster ${cluster}: ${error}`);
    }

    return pods;
  }

  private async findRelayNodePods(
    cluster: string, 
    namespace: NamespaceName, 
    deployment?: string
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(cluster);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Use the same logic as relay.ts to find relay pods
      const relayLabels = deployment 
        ? Templates.renderRelayLabels(0, deployment) // Use 0 as default componentId
        : ['app.kubernetes.io/name=hiero-relay'];

      const relayPods = await k8.pods().list(namespace, relayLabels);
      for (const pod of relayPods) {
        pods.push({pod, context: cluster, namespace});
      }

    } catch (error) {
      this.logger.debug(`No relay node pods found in cluster ${cluster}: ${error}`);
    }

    return pods;
  }

  private async findExplorerNodePods(
    cluster: string, 
    namespace: NamespaceName, 
    deployment?: string
  ): Promise<{pod: Pod; context: string; namespace: NamespaceName}[]> {
    const k8 = this.k8Factory.getK8(cluster);
    const pods: {pod: Pod; context: string; namespace: NamespaceName}[] = [];

    try {
      // Find explorer pods
      const explorerLabels = deployment 
        ? [`app.kubernetes.io/instance=${deployment}`]
        : ['app.kubernetes.io/name=hiero-explorer'];

      const explorerPods = await k8.pods().list(namespace, explorerLabels);
      for (const pod of explorerPods) {
        pods.push({pod, context: cluster, namespace});
      }

    } catch (error) {
      this.logger.debug(`No explorer node pods found in cluster ${cluster}: ${error}`);
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

      // Get logs using kubectl command (simpler and more reliable)
      const logCommand = `kubectl logs ${podName} -n ${namespace.toString()} --all-containers=true --timestamps=true`;
      const { execSync } = require('child_process');
      
      this.logger.info(`Downloading logs for pod ${podName}...`);
      
      try {
        const logs = execSync(logCommand, { encoding: 'utf8', cwd: process.cwd() });
        const logFile = path.join(podLogDir, `${podName}.log`);
        
        // Write logs to file
        fs.writeFileSync(logFile, logs);
        this.logger.info(`Saved logs to ${logFile}`);
      } catch (execError) {
        // Try without all-containers flag if that fails
        const simpleLogCommand = `kubectl logs ${podName} -n ${namespace.toString()} --timestamps=true`;
        const logs = execSync(simpleLogCommand, { encoding: 'utf8', cwd: process.cwd() });
        const logFile = path.join(podLogDir, `${podName}.log`);
        
        fs.writeFileSync(logFile, logs);
        this.logger.info(`Saved logs to ${logFile}`);
      }

    } catch (error) {
      this.logger.error(`Failed to download logs from ${type} pod ${podName}: ${error}`);
      // Continue with other pods even if one fails
    }
  }
}
