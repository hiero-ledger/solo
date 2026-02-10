// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable, inject} from 'tsyringe-neo';
import {type ArgvStruct} from '../types/aliases.js';
import {type CommandFlags} from '../types/flag-types.js';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import {type K8} from '../integration/kube/k8.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type Zippy} from '../core/zippy.js';
import yaml from 'yaml';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';

@injectable()
export class DebugCommand extends BaseCommand {
  private readonly networkNodes: NetworkNodes;
  private readonly zippyService: Zippy;

  public constructor(
    @inject(InjectTokens.NetworkNodes) private readonly networkNodesService?: NetworkNodes,
    @inject(InjectTokens.Zippy) private readonly zippyServiceInject?: Zippy,
  ) {
    super();
    this.networkNodesService = patchInject(networkNodesService, InjectTokens.NetworkNodes, DebugCommand.name);
    this.zippyService = patchInject(zippyServiceInject, InjectTokens.Zippy, DebugCommand.name);
    this.networkNodes = this.networkNodesService;
  }

  public async close(): Promise<void> {
    // No resources to close for this command
  }

  public static COLLECT_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.outputDir, flags.deployment, flags.namespace],
  };

  /**
   * Collect all debug information from the cluster
   * @param argv - command arguments
   * @returns true if successful
   */
  public async collect(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface DebugContext {
      config?: {
        outputDirectory?: string;
        namespace?: NamespaceName;
        deployment?: string;
        debugDirectory?: string;
        zipFile?: string;
      };
    }

    const tasks = new Listr<DebugContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            // Setup configuration
            if (argv[flags.deployment.name] && !argv[flags.namespace.name]) {
              self.configManager.update(argv);
              const namespace = await self.remoteConfig.getNamespace();
              argv[flags.namespace.name] = namespace.toString();
            }

            self.configManager.update(argv);

            const outputDirectory = argv[flags.outputDir.name] || constants.SOLO_LOGS_DIR;
            const deployment = argv[flags.deployment.name] || 'default';
            const namespace = argv[flags.namespace.name]
              ? NamespaceName.of(argv[flags.namespace.name])
              : self.remoteConfig?.getNamespace() || NamespaceName.of('default');

            const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').split('T')[0];
            const debugDirectory = path.join(outputDirectory, `solo-debug-${deployment}-${timestamp}`);
            const zipFile = `${debugDirectory}.zip`;

            context_.config = {
              outputDirectory,
              namespace,
              deployment,
              debugDirectory,
              zipFile,
            };

            // Create debug directory
            if (!fs.existsSync(context_.config.debugDirectory)) {
              fs.mkdirSync(context_.config.debugDirectory, {recursive: true});
            }

            self.logger.showUser(chalk.cyan(`Collecting debug information to: ${context_.config.debugDirectory}`));
          },
        },
        {
          title: 'Collect cluster information',
          task: async (context_, task) => {
            const clusterInfoDirectory = path.join(context_.config.debugDirectory, 'cluster-info');
            if (!fs.existsSync(clusterInfoDirectory)) {
              fs.mkdirSync(clusterInfoDirectory, {recursive: true});
            }

            try {
              // Get current context
              const contexts = await self.run('kubectl config get-contexts -o name');
              fs.writeFileSync(path.join(clusterInfoDirectory, 'contexts.txt'), contexts.join('\n'));

              // Get current context details
              const currentContext = await self.run('kubectl config current-context');
              fs.writeFileSync(path.join(clusterInfoDirectory, 'current-context.txt'), currentContext.join('\n'));

              // Get cluster info
              const clusterInfo = await self.run('kubectl cluster-info dump --output-directory -');
              fs.writeFileSync(path.join(clusterInfoDirectory, 'cluster-info.txt'), clusterInfo.join('\n'));

              // Get nodes
              const nodes = await self.run('kubectl get nodes -o wide');
              fs.writeFileSync(path.join(clusterInfoDirectory, 'nodes.txt'), nodes.join('\n'));

              // Get all namespaces
              const namespaces = await self.run('kubectl get namespaces');
              fs.writeFileSync(path.join(clusterInfoDirectory, 'namespaces.txt'), namespaces.join('\n'));
            } catch (error) {
              self.logger.warn('Some cluster information could not be collected', error);
            }
          },
        },
        {
          title: 'Collect helm releases',
          task: async (context_, task) => {
            const helmDirectory = path.join(context_.config.debugDirectory, 'helm-releases');
            if (!fs.existsSync(helmDirectory)) {
              fs.mkdirSync(helmDirectory, {recursive: true});
            }

            try {
              // List all helm releases
              const releases = await self.run('helm list --all-namespaces -o yaml');
              fs.writeFileSync(path.join(helmDirectory, 'all-releases.yaml'), releases.join('\n'));

              // Get helm releases in specific namespace
              const namespaceReleases = await self.run(`helm list -n ${context_.config.namespace.toString()} -o yaml`);
              fs.writeFileSync(
                path.join(helmDirectory, `${context_.config.namespace.toString()}-releases.yaml`),
                namespaceReleases.join('\n'),
              );
            } catch (error) {
              self.logger.warn('Some helm information could not be collected', error);
            }
          },
        },
        {
          title: 'Collect deployment resources',
          task: async (context_, task) => {
            const resourcesDirectory = path.join(context_.config.debugDirectory, 'resources');
            if (!fs.existsSync(resourcesDirectory)) {
              fs.mkdirSync(resourcesDirectory, {recursive: true});
            }

            try {
              const k8: K8 = self.k8Factory.default();
              const namespace = context_.config.namespace;

              // Get pods
              const pods: Pod[] = await k8.pods().list(namespace, []);
              const podsData = pods.map(pod => ({
                podReference: pod.podReference?.name,
                labels: pod.labels,
                podIp: pod.podIp,
                containerImage: pod.containerImage,
                conditions: pod.conditions,
              }));
              fs.writeFileSync(path.join(resourcesDirectory, 'pods.yaml'), yaml.stringify(podsData));

              // Get pod status details
              const podStatus = await self.run(`kubectl get pods -n ${namespace.toString()} -o wide`);
              fs.writeFileSync(path.join(resourcesDirectory, 'pod-status.txt'), podStatus.join('\n'));

              // Get services
              const services = await self.run(`kubectl get services -n ${namespace.toString()} -o yaml`);
              fs.writeFileSync(path.join(resourcesDirectory, 'services.yaml'), services.join('\n'));

              // Get deployments
              const deployments = await self.run(`kubectl get deployments -n ${namespace.toString()} -o yaml`);
              fs.writeFileSync(path.join(resourcesDirectory, 'deployments.yaml'), deployments.join('\n'));

              // Get statefulsets
              const statefulsets = await self.run(`kubectl get statefulsets -n ${namespace.toString()} -o yaml`);
              fs.writeFileSync(path.join(resourcesDirectory, 'statefulsets.yaml'), statefulsets.join('\n'));

              // Get configmaps
              const configMaps: ConfigMap[] = await k8.configMaps().list(namespace, []);
              const configMapsData = configMaps.map(cm => ({
                name: cm.name.toString(),
                labels: cm.labels,
              }));
              fs.writeFileSync(path.join(resourcesDirectory, 'configmaps.yaml'), yaml.stringify(configMapsData));

              // Get secrets (names only, not content)
              const secrets: Secret[] = await k8.secrets().list(namespace, []);
              const secretNames = secrets.map(s => ({name: s.name.toString(), type: s.type}));
              fs.writeFileSync(path.join(resourcesDirectory, 'secrets.json'), JSON.stringify(secretNames, null, 2));

              // Get persistent volume claims
              const pvcs = await self.run(`kubectl get pvc -n ${namespace.toString()} -o yaml`);
              fs.writeFileSync(path.join(resourcesDirectory, 'persistent-volume-claims.yaml'), pvcs.join('\n'));

              // Get ingresses
              const ingresses = await self.run(`kubectl get ingress -n ${namespace.toString()} -o yaml`);
              fs.writeFileSync(path.join(resourcesDirectory, 'ingresses.yaml'), ingresses.join('\n'));
            } catch (error) {
              self.logger.warn('Some deployment resources could not be collected', error);
            }
          },
        },
        {
          title: 'Collect pod logs',
          task: async (context_, task) => {
            const logsDirectory = path.join(context_.config.debugDirectory, 'pod-logs');
            if (!fs.existsSync(logsDirectory)) {
              fs.mkdirSync(logsDirectory, {recursive: true});
            }

            try {
              const k8: K8 = self.k8Factory.default();
              const namespace = context_.config.namespace;
              const pods: Pod[] = await k8.pods().list(namespace, []);

              for (const pod of pods) {
                const podName = pod.podReference?.name.toString() || 'unknown';
                const logFile = path.join(logsDirectory, `${podName}.log`);

                try {
                  const logs = await self.run(
                    `kubectl logs ${podName} -n ${namespace.toString()} --all-containers=true --timestamps=true`,
                  );
                  fs.writeFileSync(logFile, logs.join('\n'));
                } catch {
                  // Try without all-containers flag
                  try {
                    const logs = await self.run(`kubectl logs ${podName} -n ${namespace.toString()} --timestamps=true`);
                    fs.writeFileSync(logFile, logs.join('\n'));
                  } catch (innerError) {
                    self.logger.warn(`Could not collect logs for pod ${podName}`, innerError);
                  }
                }
              }
            } catch (error) {
              self.logger.warn('Some pod logs could not be collected', error);
            }
          },
        },
        {
          title: 'Collect network node logs and configs',
          task: async (context_, task) => {
            try {
              const namespace = context_.config.namespace;
              const k8: K8 = self.k8Factory.default();

              // Check if there are network nodes
              const networkPods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

              if (networkPods.length > 0) {
                const nodeLogsDirectory = path.join(context_.config.debugDirectory, 'network-node-logs');
                await self.networkNodes.getLogs(namespace, undefined, nodeLogsDirectory);
              }
            } catch (error) {
              self.logger.warn('Network node logs could not be collected', error);
            }
          },
        },
        {
          title: 'Collect port-forward information',
          task: async (context_, task) => {
            try {
              // Get active port-forwards (if any)
              const portForwards = await self.run(
                'ps aux | grep "kubectl port-forward" | grep -v grep || echo "No active port-forwards"',
              );
              fs.writeFileSync(path.join(context_.config.debugDirectory, 'port-forwards.txt'), portForwards.join('\n'));
            } catch (error) {
              self.logger.warn('Port-forward information could not be collected', error);
            }
          },
        },
        {
          title: 'Collect system information',
          task: async (context_, task) => {
            const systemDirectory = path.join(context_.config.debugDirectory, 'system-info');
            if (!fs.existsSync(systemDirectory)) {
              fs.mkdirSync(systemDirectory, {recursive: true});
            }

            try {
              // Get solo version
              const soloVersion = await self.run('solo version || echo "Solo version not available"');
              fs.writeFileSync(path.join(systemDirectory, 'solo-version.txt'), soloVersion.join('\n'));

              // Get kubectl version
              const kubectlVersion = await self.run('kubectl version --short --client || kubectl version');
              fs.writeFileSync(path.join(systemDirectory, 'kubectl-version.txt'), kubectlVersion.join('\n'));

              // Get helm version
              const helmVersion = await self.run('helm version --short');
              fs.writeFileSync(path.join(systemDirectory, 'helm-version.txt'), helmVersion.join('\n'));

              // Get docker/podman info
              const containerInfo = await self.run(
                'docker info 2>/dev/null || podman info 2>/dev/null || echo "No container runtime found"',
              );
              fs.writeFileSync(path.join(systemDirectory, 'container-runtime.txt'), containerInfo.join('\n'));

              // Get kind clusters
              const kindClusters = await self.run('kind get clusters || echo "No kind clusters found"');
              fs.writeFileSync(path.join(systemDirectory, 'kind-clusters.txt'), kindClusters.join('\n'));
            } catch (error) {
              self.logger.warn('Some system information could not be collected', error);
            }
          },
        },
        {
          title: 'Create zip archive',
          task: async (context_, task) => {
            await self.zippyService.zip(context_.config.debugDirectory, context_.config.zipFile);
            self.logger.showUser(chalk.green('\n✓ Debug information collected successfully!'));
            self.logger.showUser(chalk.cyan(`  Directory: ${context_.config.debugDirectory}`));
            self.logger.showUser(chalk.cyan(`  Archive: ${context_.config.zipFile}`));
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      return true;
    } catch (error: Error | unknown) {
      throw new SoloError(`Failed to collect debug information: ${(error as Error).message}`, error as Error);
    }
  }
}
