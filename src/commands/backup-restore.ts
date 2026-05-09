// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable, container} from 'tsyringe-neo';
import {type ArgvStruct, NodeAlias} from '../types/aliases.js';
import {type CommandFlags} from '../types/flag-types.js';
import chalk from 'chalk';
import yaml from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type K8} from '../integration/kube/k8.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {SoloError} from '../core/errors/solo-error.js';
import {type Context, type ClusterReferences, type SoloListrTask} from '../types/index.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import * as helpers from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {plainToInstance} from 'class-transformer';
import {RemoteConfigSchema} from '../data/schema/model/remote/remote-config-schema.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {type DeploymentStateSchema} from '../data/schema/model/remote/deployment-state-schema.js';
import {type DeploymentName} from '../types/index.js';
import {type ApplicationVersionsSchema} from '../data/schema/model/common/application-versions-schema.js';
import {KeysCommandDefinition} from './command-definitions/keys-command-definition.js';
import {ConsensusCommandDefinition} from './command-definitions/consensus-command-definition.js';
import {BlockCommandDefinition} from './command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from './command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from './command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from './command-definitions/relay-command-definition.js';
import {ClusterReferenceCommandDefinition} from './command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from './command-definitions/deployment-command-definition.js';
import * as CommandHelpers from './command-helpers.js';
import {optionFromFlag, subTaskSoloCommand, invokeSoloCommand} from './command-helpers.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type DefaultKindClientBuilder} from '../integration/kind/impl/default-kind-client-builder.js';
import {KindClient} from '../integration/kind/kind-client.js';
import {type ClusterCreateResponse} from '../integration/kind/model/create-cluster/cluster-create-response.js';
import {ShellRunner} from '../core/shell-runner.js';
import {PathEx} from '../business/utils/path-ex.js';
import {Chart} from '../integration/helm/model/chart.js';
import {Repository} from '../integration/helm/model/repository.js';
import {InstallChartOptionsBuilder} from '../integration/helm/model/install/install-chart-options-builder.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Container} from '../integration/kube/resources/container/container.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {type Service} from '../integration/kube/resources/service/service.js';
import {Templates} from '../core/templates.js';
import * as Base64 from 'js-base64';

interface ExpectedLbIpAssignment {
  context: Context;
  serviceName: string;
  expectedIp: string;
}

interface ExternalDatabaseParameters {
  context: Context;
  namespace: string;
  podName: string;
  containerName: string;
  databaseName: string;
  ownerUsername: string;
  ownerPassword: string;
}

@injectable()
export class BackupRestoreCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.KindBuilder) protected readonly kindBuilder: DefaultKindClientBuilder,
    @inject(InjectTokens.KubectlInstallationDirectory) private readonly kubectlInstallationDirectory: string,
  ) {
    super();
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, BackupRestoreCommand.name);
    this.kubectlInstallationDirectory = patchInject(
      kubectlInstallationDirectory,
      InjectTokens.KubectlInstallationDirectory,
      BackupRestoreCommand.name,
    );
  }

  public async close(): Promise<void> {
    // No resources to close for this command
  }

  public static BACKUP_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.quiet,
      flags.outputDir,
      flags.zipPassword,
      flags.zipFile,
      flags.backupExternalDatabase,
      flags.externalDbParamsFile,
    ],
  };

  public static RESTORE_CONFIG_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet, flags.inputDir, flags.externalDbParamsFile],
  };

  public static RESTORE_CLUSTERS_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet, flags.optionsFile, flags.metallbConfig, flags.zipPassword, flags.zipFile],
  };

  public static RESTORE_NETWORK_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet, flags.optionsFile, flags.shard, flags.realm, flags.expectedLbIpsFile, flags.skipIpTracking],
  };

  /**
   * Generic export function for Kubernetes resources from multiple clusters
   * @param outputDirectory - directory to export resources to
   * @param resourceType - type of resource ('configmaps' or 'secrets')
   * @returns total number of resources exported across all clusters
   */
  private async exportResources(outputDirectory: string, resourceType: 'configmaps' | 'secrets'): Promise<number> {
    try {
      const namespace: NamespaceName = this.remoteConfig.getNamespace();
      const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nExporting ${resourceType} from namespace: ${namespace.toString()} across ${clusterReferences.size} cluster(s)`,
        ),
      );

      let totalExportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterReference, context] of clusterReferences.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterReference} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);

        // Create output directory using cluster reference (not context)
        const contextDirectory: string = PathEx.join(outputDirectory, clusterReference, resourceType);
        if (!fs.existsSync(contextDirectory)) {
          fs.mkdirSync(contextDirectory, {recursive: true});
        }

        // Fetch resources based on type
        let resources: (ConfigMap | Secret)[];
        let totalCount: number;

        if (resourceType === 'configmaps') {
          resources = await k8.configMaps().list(namespace, []);
          totalCount = resources.length;
        } else {
          // For secrets, filter to only include Opaque type
          const allSecrets: Secret[] = await k8.secrets().list(namespace, []);
          resources = allSecrets.filter((secret: Secret): boolean => secret.type === 'Opaque');
          totalCount = allSecrets.length;
        }

        if (resources.length === 0) {
          const message: string =
            resourceType === 'secrets'
              ? '    No Opaque secrets found in this cluster'
              : `    No ${resourceType} found in this cluster`;
          this.logger.showUser(chalk.yellow(message));
          continue;
        }

        const countMessage: string =
          resourceType === 'secrets' && totalCount !== resources.length
            ? `    Found ${resources.length} Opaque secret(s) (filtered from ${totalCount} total)`
            : `    Found ${resources.length} ${resourceType}`;
        this.logger.showUser(chalk.white(countMessage));

        // Export each resource as YAML
        for (const resource of resources) {
          const fileName: string = `${resource.name}.yaml`;
          const filePath: string = PathEx.join(contextDirectory, fileName);

          // Create a Kubernetes-compatible resource object
          const k8sResource: Record<string, unknown> = {
            apiVersion: 'v1',
            kind: resourceType === 'configmaps' ? 'ConfigMap' : 'Secret',
            metadata: {
              name: resource.name,
              namespace: resource.namespace.toString(),
              labels: resource.labels || {},
              annotations: {
                'solo.hedera.com/cluster-context': context,
              },
            },
            data: resource.data || {},
          };

          // Add type field for secrets
          if (resourceType === 'secrets') {
            k8sResource.type = (resource as Secret).type || 'Opaque';
          }

          // Convert to YAML and write to file
          const yamlContent: string = yaml.stringify(k8sResource, {sortMapEntries: true});
          fs.writeFileSync(filePath, yamlContent, 'utf8');
        }

        this.logger.showUser(chalk.green(`  ✓ Exported ${resources.length} ${resourceType} from context: ${context}`));
        totalExportedCount += resources.length;
      }

      this.logger.showUser(
        chalk.green(
          `\n✓ Total exported: ${totalExportedCount} ${resourceType} from ${clusterReferences.size} cluster(s) to ${outputDirectory}/${resourceType}/`,
        ),
      );
      return totalExportedCount;
    } catch (error) {
      throw new SoloError(`Failed to export ${resourceType}: ${error.message}`, error);
    }
  }

  private async waitForConsensusPods(): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    for (const consensusNode of consensusNodes) {
      const context: Context = helpers.extractContextFromConsensusNodes(consensusNode.name, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);
      this.logger.info(
        `Waiting for pod of node ${consensusNode.name} in namespace ${namespace.toString()} (context: ${context})`,
      );
      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
          constants.PODS_RUNNING_MAX_ATTEMPTS,
          constants.PODS_RUNNING_DELAY,
        );
    }
  }

  /**
   * Export all configmaps from the cluster as YAML files
   * @param outputDirectory - directory to export configmaps to
   * @returns number of configmaps exported
   */
  private async exportConfigMaps(outputDirectory: string): Promise<number> {
    return this.exportResources(outputDirectory, 'configmaps');
  }

  /**
   * Export all secrets from the cluster as YAML files
   * @param outputDirectory - directory to export secrets to
   * @returns number of secrets exported
   */
  private async exportSecrets(outputDirectory: string): Promise<number> {
    return this.exportResources(outputDirectory, 'secrets');
  }

  /**
   * Backup all component configurations
   */
  public async backup(argv: ArgvStruct): Promise<boolean> {
    // Load configurations
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv);

    this.configManager.update(argv);

    const outputDirectory: string = this.configManager.getFlag<string>(flags.outputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);
    const shouldBackupExternalDatabase: boolean = this.configManager.getFlag<boolean>(flags.backupExternalDatabase);

    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {recursive: true});
    }

    // Export configmaps and secrets from the cluster
    interface BackupContext {
      configMapCount: number;
      secretCount: number;
      externalDatabaseParameters?: ExternalDatabaseParameters;
      externalDatabaseDumpPath?: string;
      externalDatabaseParamsPath?: string;
    }

    // Get namespace, contexts, and cluster references for backup operations
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    // Note: Network should be frozen before backup
    // Run: solo consensus network freeze --deployment <deployment-name>
    this.logger.showUser(
      chalk.yellow(
        '\n⚠️  Recommendation: Freeze the network before backup for data consistency.\n' +
          `   Run: solo consensus network freeze --deployment ${this.configManager.getFlag(flags.deployment)}\n`,
      ),
    );

    const tasks: Listr<BackupContext, any, any> = new Listr(
      [
        {
          title: 'Resolve external database parameters',
          skip: (): boolean => !shouldBackupExternalDatabase,
          task: async (context_, task): Promise<void> => {
            context_.externalDatabaseParameters = await this.resolveExternalDatabaseParametersForBackup();
            task.title =
              `Resolve external database parameters: ${context_.externalDatabaseParameters.context}/` +
              `${context_.externalDatabaseParameters.namespace}/${context_.externalDatabaseParameters.podName}`;
          },
        },
        {
          title: 'Wait for mirror importer to catch up',
          skip: (context_): boolean => !shouldBackupExternalDatabase || !context_.externalDatabaseParameters,
          task: async (context_, task): Promise<void> => {
            await this.waitForMirrorImporterCatchUp(context_.externalDatabaseParameters);
            task.title = 'Wait for mirror importer to catch up: completed';
          },
        },
        {
          title: 'Export ConfigMaps',
          task: async (context_, task): Promise<void> => {
            context_.configMapCount = await this.exportConfigMaps(outputDirectory);
            task.title = `Export ConfigMaps: ${context_.configMapCount} exported`;
          },
        },
        {
          title: 'Export Secrets',
          task: async (context_, task): Promise<void> => {
            context_.secretCount = await this.exportSecrets(outputDirectory);
            task.title = `Export Secrets: ${context_.secretCount} exported`;
          },
        },
        {
          title: 'Download Node Logs',
          task: async (context_, task): Promise<void> => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
            for (const [clusterReference, context] of clusterReferences.entries()) {
              const logsDirectory: string = PathEx.join(outputDirectory, clusterReference, 'logs');
              await networkNodes.getLogs(namespace, [context], logsDirectory);
            }
            task.title = `Download Node Logs: ${clusterReferences.size} cluster(s) completed`;
          },
        },
        {
          title: 'Download Node State Files',
          task: async (context_, task): Promise<void> => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
            for (const node of consensusNodes) {
              const nodeAlias: NodeAlias = node.name;
              const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
              const clusterReference: string = node.cluster; // Get cluster ref from node metadata
              const statesDirectory: string = PathEx.join(outputDirectory, 'states', clusterReference);
              await networkNodes.getStatesFromPod(namespace, nodeAlias, context, statesDirectory);
            }
            task.title = `Download Node State Files: ${consensusNodes.length} node(s) completed`;
          },
        },
        {
          title: 'Export external database backup artifacts',
          skip: (context_): boolean => !shouldBackupExternalDatabase || !context_.externalDatabaseParameters,
          task: async (context_, task): Promise<void> => {
            context_.externalDatabaseDumpPath = await this.exportExternalDatabaseBackup(
              outputDirectory,
              context_.externalDatabaseParameters,
            );
            context_.externalDatabaseParamsPath = this.writeExternalDatabaseParameters(
              outputDirectory,
              context_.externalDatabaseParameters,
            );
            task.title =
              `Export external database backup artifacts: dump='${context_.externalDatabaseDumpPath}', ` +
              `params='${context_.externalDatabaseParamsPath}'`;
          },
        },
        {
          title: 'Compress backup directory',
          skip: (): boolean => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            return !zipPassword;
          },
          task: async (): Promise<void> => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            const zipFile: string = this.configManager.getFlag<string>(flags.zipFile);
            const compressionCommand: string = `cd "${outputDirectory}" && zip -rX -P "${zipPassword}" "${zipFile}" .`;
            const shellRunner: ShellRunner = new ShellRunner(this.logger);
            await shellRunner.run(compressionCommand, [], true, false);
            this.logger.showUser(chalk.green(`Backup compressed to ${zipFile}`));
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      const context_: BackupContext = await tasks.run();

      if (!quiet) {
        this.logger.showUser('');
        this.logger.showUser(
          chalk.green(
            `✅ Backup completed: ${context_.configMapCount} configmap(s) and ${context_.secretCount} secret(s) exported`,
          ),
        );
      }
    } catch (error) {
      this.logger.showUser(chalk.red(`❌ Error during backup: ${error.message}`));
      throw error;
    }

    return true;
  }

  /**
   * Generic import function for Kubernetes resources from multiple clusters
   * @param inputDirectory - directory to import resources from
   * @param resourceType - type of resource ('configmaps' or 'secrets')
   * @returns total number of resources imported across all clusters
   */
  private async importResources(inputDirectory: string, resourceType: 'configmaps' | 'secrets'): Promise<number> {
    try {
      const namespace: NamespaceName = this.remoteConfig.getNamespace();
      const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nImporting ${resourceType} to namespace: ${namespace.toString()} across ${clusterReferences.size} cluster(s)`,
        ),
      );

      let totalImportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterReference, context] of clusterReferences.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterReference} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);
        const contextDirectory: string = PathEx.join(inputDirectory, clusterReference, resourceType);

        // Check if directory exists
        if (!fs.existsSync(contextDirectory)) {
          this.logger.showUser(chalk.yellow(`    No ${resourceType} directory found for context: ${context}`));
          continue;
        }

        // Read all YAML files in the directory
        const files: string[] = fs
          .readdirSync(contextDirectory)
          .filter((file: string): boolean => file.endsWith('.yaml'));

        if (files.length === 0) {
          this.logger.showUser(chalk.yellow(`    No ${resourceType} YAML files found in this cluster`));
          continue;
        }

        this.logger.showUser(chalk.white(`    Found ${files.length} ${resourceType} file(s)`));

        // Import each resource from YAML
        for (const file of files) {
          const filePath: string = PathEx.join(contextDirectory, file);
          const yamlContent: string = fs.readFileSync(filePath, 'utf8');
          const resource: any = yaml.parse(yamlContent);

          try {
            // skip configMap file SOLO_REMOTE_CONFIGMAP_NAME
            if (resource.metadata.name === constants.SOLO_REMOTE_CONFIGMAP_NAME) {
              this.logger.showUser(chalk.yellow(`    Skipping ${resourceType} file: ${resource.metadata.name}`));
              continue;
            }

            await (resourceType === 'configmaps'
              ? k8
                  .configMaps()
                  .createOrReplace(
                    namespace,
                    resource.metadata.name,
                    resource.metadata.labels || {},
                    resource.data || {},
                  )
              : k8
                  .secrets()
                  .createOrReplace(
                    namespace,
                    resource.metadata.name,
                    resource.type || 'Opaque',
                    resource.data || {},
                    resource.metadata.labels || {},
                  ));
            this.logger.showUser(chalk.gray(`    ✓ Imported: ${resource.metadata.name}`));
            totalImportedCount++;
          } catch (error) {
            this.logger.showUser(chalk.red(`    ✗ Failed to import ${file}: ${error.message}`));
          }
        }

        this.logger.showUser(chalk.green(`  ✓ Imported ${resourceType} to context: ${context}`));
      }

      this.logger.showUser(
        chalk.green(
          `\n✓ Total imported: ${totalImportedCount} ${resourceType} to ${clusterReferences.size} cluster(s)`,
        ),
      );
      return totalImportedCount;
    } catch (error) {
      throw new SoloError(`Failed to import ${resourceType}: ${error.message}`, error);
    }
  }

  /**
   * Import all configmaps to the cluster from YAML files
   * @param inputDirectory - directory to import configmaps from
   * @returns number of configmaps imported
   */
  private async importConfigMaps(inputDirectory: string): Promise<number> {
    return this.importResources(inputDirectory, 'configmaps');
  }

  /**
   * Import all secrets to the cluster from YAML files
   * @param inputDirectory - directory to import secrets from
   * @returns number of secrets imported
   */
  private async importSecrets(inputDirectory: string): Promise<number> {
    return this.importResources(inputDirectory, 'secrets');
  }

  /**
   * Restore logs and configs to consensus nodes
   * @param inputDirectory - directory containing logs
   * @returns Promise that resolves when restoration is complete
   */
  private async restoreLogsAndConfigs(inputDirectory: string): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

    for (const [clusterReference, context] of clusterReferences.entries()) {
      const logsDirectory: string = PathEx.join(inputDirectory, clusterReference, 'logs', namespace.toString());

      // Check if logs directory exists
      if (!fs.existsSync(logsDirectory)) {
        this.logger.showUser(chalk.yellow(`  No logs directory found for context: ${context}`));
        continue;
      }

      // Get all log zip files directly from logs directory
      const allFiles: string[] = fs.readdirSync(logsDirectory);
      this.logger.showUser(`Files are found in ${logsDirectory} are : ${allFiles.join(', ')}`);
      const logFiles: string[] = allFiles.filter((file): boolean => file.endsWith(constants.LOG_CONFIG_ZIP_SUFFIX));

      if (logFiles.length === 0) {
        this.logger.showUser(
          chalk.red(`  No log files found in context: ${context} (found ${allFiles.length} file(s))`),
        );
        this.logger.showUser(chalk.gray(`    Available files: ${allFiles.join(', ')}`));
        throw new SoloError(`No log files found to restore in context: ${context}`);
      }

      this.logger.showUser(chalk.white(`  Restoring ${logFiles.length} log file(s) to context: ${context}`));

      // Get all pods in this context
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

      // Upload logs to each pod
      for (const logFile of logFiles) {
        // Extract pod name from log file by removing the suffix
        const podName: string = logFile.replace(constants.LOG_CONFIG_ZIP_SUFFIX, '');
        const pod: Pod = pods.find((p: any): boolean => p.podReference.name.name === podName);

        if (!pod) {
          this.logger.showUser(chalk.yellow(`    No matching pod found for log file: ${logFile}`));
          continue;
        }

        const logFilePath: string = PathEx.join(logsDirectory, logFile);
        const podReference: PodReference = pod.podReference;
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const container: Container = k8.containers().readByRef(containerReference);

        // Upload zipped log file to pod
        this.logger.showUser(chalk.gray(`    Uploading log file: ${logFile}`));
        await container.copyTo(logFilePath, `${constants.HEDERA_HAPI_PATH}`);

        // Wait for file to sync to the file system
        await helpers.sleep(Duration.ofSeconds(2));

        // Unzip the log file
        this.logger.showUser(chalk.gray(`    Extracting log file in pod: ${podName}`));
        await container.execContainer([
          'unzip',
          '-o',
          `${constants.HEDERA_HAPI_PATH}/${logFile}`,
          '-d',
          `${constants.HEDERA_HAPI_PATH}`,
        ]);

        // Fix ownership of extracted files to hedera user
        this.logger.showUser(chalk.gray(`    Setting ownership for extracted files in pod: ${podName}`));
        await container.execContainer(['bash', '-c', `chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}`]);

        this.logger.showUser(chalk.green(`    ✓ Restored log for pod: ${podName}`));
      }
    }
  }

  /**
   * Resolve the current consensus pod references by node alias.
   * This is used after pod restarts so later restore steps target live pods.
   */
  private async buildConsensusPodReferences(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    nodeAliases: string[],
  ): Promise<Record<string, PodReference>> {
    const podReferences: Record<string, PodReference> = {};

    for (const nodeAlias of nodeAliases) {
      const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as NodeAlias, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: Pod[] = await k8
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

      if (pods.length > 0) {
        podReferences[nodeAlias] = pods[0].podReference;
      }
    }

    return podReferences;
  }

  /**
   * Restart pods by deleting them and waiting for replacement pods to become ready.
   * We use this for components that are easiest to bounce by label selection.
   */
  private async restartPodsMatchingLabels(
    context: Context,
    namespace: NamespaceName,
    labels: string[],
    description: string,
  ): Promise<void> {
    const k8: K8 = this.k8Factory.getK8(context);
    const pods: Pod[] = await k8.pods().list(namespace, labels);
    if (pods.length === 0) {
      this.logger.info(`No pods found for ${description} in context ${context}`);
      return;
    }

    for (const pod of pods) {
      await k8.pods().delete(pod.podReference);
    }

    await k8
      .pods()
      .waitForReadyStatus(namespace, labels, constants.PODS_READY_MAX_ATTEMPTS, constants.PODS_READY_DELAY);
  }

  /**
   * Resolve mirror release name while supporting legacy release naming.
   * Mirror node id=1 may still be installed under the old fixed release name.
   */
  private async resolveMirrorReleaseName(
    mirrorId: number,
    mirrorNamespace: NamespaceName,
    mirrorContext: Context,
  ): Promise<string> {
    if (mirrorId !== 1) {
      return Templates.renderMirrorNodeName(mirrorId);
    }

    const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
      mirrorNamespace,
      constants.MIRROR_NODE_RELEASE_NAME,
      mirrorContext,
    );
    return isLegacyChartInstalled ? constants.MIRROR_NODE_RELEASE_NAME : Templates.renderMirrorNodeName(mirrorId);
  }

  /**
   * Trigger a deployment rollout by patching a restart annotation.
   * This avoids delete/recreate and keeps restart behavior explicit.
   */
  private async patchDeploymentRestartAnnotation(
    context: Context,
    namespace: NamespaceName,
    deploymentName: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: deploymentName,
          namespace: namespace.name,
        },
        spec: {
          template: {
            metadata: {
              annotations: {
                'solo.hedera.com/restartedAt': new Date().toISOString(),
              },
            },
          },
        },
      });
  }

  /**
   * Restart mirror runtime dependencies that cache state/config.
   * Redis and MinIO pods are restarted so restored config/database state is reloaded.
   */
  private async restartMirrorRuntimeDependencies(namespace: NamespaceName): Promise<void> {
    const mirrorNodes: any[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const processedContexts: Set<string> = new Set<string>();

    for (const mirrorNode of mirrorNodes) {
      const mirrorContext: Context = clusterReferences.get(mirrorNode.metadata.cluster);
      if (!mirrorContext || processedContexts.has(mirrorContext)) {
        continue;
      }

      processedContexts.add(mirrorContext);
      await this.restartPodsMatchingLabels(
        mirrorContext,
        namespace,
        [constants.SOLO_MIRROR_REDIS_NAME_LABEL],
        'mirror redis',
      );
    }

    for (const context of clusterReferences.values()) {
      await this.restartPodsMatchingLabels(context, namespace, ['v1.min.io/tenant=minio'], 'minio');
    }
  }

  /**
   * Read mirror importer DB credentials from the mirror-passwords secret.
   * These credentials are used for database export/restore operations.
   */
  private async resolveMirrorDatabaseCredentials(
    mirrorNamespace: NamespaceName,
    mirrorContext: Context,
  ): Promise<{dbName: string; ownerUsername: string; ownerPassword: string}> {
    const mirrorPasswordsSecret: Secret = await this.k8Factory
      .getK8(mirrorContext)
      .secrets()
      .read(mirrorNamespace, 'mirror-passwords');

    const ownerKey: string | undefined = Object.keys(mirrorPasswordsSecret.data).find((key: string): boolean =>
      key.endsWith('_MIRROR_IMPORTER_DB_OWNER'),
    );
    if (!ownerKey) {
      throw new SoloError('Could not find MIRROR_IMPORTER_DB_OWNER in mirror-passwords secret.');
    }

    const environmentVariablePrefix: string = ownerKey.replace('_MIRROR_IMPORTER_DB_OWNER', '');
    return {
      dbName: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`]),
      ownerUsername: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`]),
      ownerPassword: Base64.decode(
        mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
      ),
    };
  }

  /**
   * Resolve a database pod name in the external DB namespace/context.
   * Backup/restore needs a concrete pod target for pg_dump/psql execution.
   */
  private async resolveExternalDbPodName(databaseNamespace: NamespaceName, databaseContext: Context): Promise<string> {
    const pods: Pod[] = await this.k8Factory.getK8(databaseContext).pods().list(databaseNamespace, []);
    if (pods.length === 0) {
      throw new SoloError(
        `No pods found in external DB namespace ${databaseNamespace.name} (context: ${databaseContext})`,
      );
    }

    return pods[0].podReference.name.toString();
  }

  private resolveExternalDbParamsFilePath(baseDirectory: string): {paramsFilePath: string; fromFlag: boolean} {
    const configuredPath: string = this.configManager.getFlag<string>(flags.externalDbParamsFile);
    if (configuredPath) {
      return {
        paramsFilePath: path.isAbsolute(configuredPath) ? configuredPath : PathEx.resolve(configuredPath),
        fromFlag: true,
      };
    }

    return {
      paramsFilePath: PathEx.join(baseDirectory, 'external-database-params.json'),
      fromFlag: false,
    };
  }

  private readExternalDatabaseParameters(
    baseDirectory: string,
    required = false,
  ): ExternalDatabaseParameters | undefined {
    const {paramsFilePath, fromFlag} = this.resolveExternalDbParamsFilePath(baseDirectory);
    if (!fs.existsSync(paramsFilePath)) {
      if (fromFlag || required) {
        throw new SoloError(`External database parameters file not found: ${paramsFilePath}`);
      }
      return undefined;
    }

    const parsedPayload: any = JSON.parse(fs.readFileSync(paramsFilePath, 'utf8'));
    const parameters: any = parsedPayload.parameters || parsedPayload;

    const requiredKeys: string[] = [
      'context',
      'namespace',
      'podName',
      'containerName',
      'databaseName',
      'ownerUsername',
      'ownerPassword',
    ];
    const missingKeys: string[] = requiredKeys.filter(
      (key: string): boolean => !parameters[key] || typeof parameters[key] !== 'string',
    );
    if (missingKeys.length > 0) {
      throw new SoloError(
        `Invalid external database parameters file '${paramsFilePath}'. Missing or invalid keys: ${missingKeys.join(', ')}`,
      );
    }

    return {
      context: parameters.context,
      namespace: parameters.namespace,
      podName: parameters.podName,
      containerName: parameters.containerName,
      databaseName: parameters.databaseName,
      ownerUsername: parameters.ownerUsername,
      ownerPassword: parameters.ownerPassword,
    };
  }

  private writeExternalDatabaseParameters(baseDirectory: string, parameters: ExternalDatabaseParameters): string {
    const {paramsFilePath} = this.resolveExternalDbParamsFilePath(baseDirectory);
    const payload: Record<string, unknown> = {
      version: 1,
      createdAt: new Date().toISOString(),
      parameters,
    };
    fs.writeFileSync(paramsFilePath, `${JSON.stringify(payload, undefined, 2)}\n`, 'utf8');
    return paramsFilePath;
  }

  /**
   * Wait until mirror REST data has converged after freeze.
   * We poll the latest transaction over REST and require stable consensus timestamps.
   */
  private async waitForMirrorImporterCatchUp(parameters: ExternalDatabaseParameters): Promise<void> {
    this.logger.info(
      `Waiting for mirror importer to catch up to frozen consensus state (external DB: ${parameters.context}/${parameters.namespace}/${parameters.podName})...`,
    );
    const mirrorNodes: any[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    if (mirrorNodes.length === 0) {
      throw new SoloError('No mirror node found in deployment state; cannot poll mirror REST API.');
    }

    const mirrorNode: any = mirrorNodes[0];
    const mirrorContext: Context = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
    const mirrorNamespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
    const mirrorReleaseName: string = await this.resolveMirrorReleaseName(
      Number(mirrorNode.metadata.id),
      mirrorNamespace,
      mirrorContext,
    );

    const mirrorPods: Pod[] = await this.k8Factory
      .getK8(mirrorContext)
      .pods()
      .list(mirrorNamespace, [
        constants.SOLO_MIRROR_REST_NAME_LABEL,
        `app.kubernetes.io/instance=${mirrorReleaseName}`,
      ]);

    if (mirrorPods.length === 0) {
      throw new SoloError(
        `No mirror REST pod found in namespace ${mirrorNamespace.name} (context: ${mirrorContext}, release: ${mirrorReleaseName})`,
      );
    }

    const mirrorRestPod: Pod = this.k8Factory.getK8(mirrorContext).pods().readByReference(mirrorPods[0].podReference);
    const localMirrorRestPort: number = await mirrorRestPod.portForward(
      constants.MIRROR_NODE_PORT,
      constants.MIRROR_NODE_PORT,
      false,
      false,
    );

    let previousConsensusTimestamp: string = '';
    let stableCount: number = 0;
    const endpoint: string = `http://localhost:${localMirrorRestPort}/api/v1/transactions?limit=1&order=desc`;
    try {
      for (let attempt: number = 1; attempt <= 100; attempt++) {
        let currentConsensusTimestamp: string = '';
        let currentTransactionName: string = '';
        try {
          const response: Response = await fetch(endpoint);
          if (response.ok) {
            const responsePayload: any = await response.json();
            const latestTransaction: any =
              Array.isArray(responsePayload?.transactions) && responsePayload.transactions.length > 0
                ? responsePayload.transactions[0]
                : undefined;
            currentConsensusTimestamp =
              typeof latestTransaction?.consensus_timestamp === 'string' ? latestTransaction.consensus_timestamp : '';
            currentTransactionName = typeof latestTransaction?.name === 'string' ? latestTransaction.name : '';
          } else {
            this.logger.info(
              `Mirror REST poll failed with status ${response.status}; attempt ${attempt}/100, retrying...`,
            );
          }
        } catch (error: any) {
          this.logger.info(`Mirror REST poll error '${error.message || error}'; attempt ${attempt}/100, retrying...`);
        }

        this.logger.info(
          `Mirror REST latest tx: ${currentTransactionName || '<unknown>'} @ ${currentConsensusTimestamp || '<empty>'}`,
        );

        if (currentConsensusTimestamp && currentConsensusTimestamp === previousConsensusTimestamp) {
          stableCount++;
          if (stableCount >= 3) {
            this.logger.info(`Mirror importer is stable at consensus timestamp ${currentConsensusTimestamp}`);
            return;
          }
        } else {
          stableCount = 0;
        }

        previousConsensusTimestamp = currentConsensusTimestamp || previousConsensusTimestamp;
        await helpers.sleep(Duration.ofSeconds(3));
      }

      this.logger.info('Mirror importer catch-up wait timed out after 100 checks; proceeding with backup.');
    } finally {
      try {
        await mirrorRestPod.stopPortForward(localMirrorRestPort);
      } catch (error: any) {
        this.logger.info(
          `Unable to stop temporary mirror REST port-forward on port ${localMirrorRestPort}: ${error.message || error}`,
        );
      }
    }
  }

  /**
   * Build the external DB parameter set used by backup.
   * Parameters include pod/container location plus DB credentials from mirror secrets.
   */
  private async resolveExternalDatabaseParametersForBackup(): Promise<ExternalDatabaseParameters> {
    const mirrorNodes: any[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    if (mirrorNodes.length === 0) {
      throw new SoloError('No mirror node found in deployment state; cannot back up external database.');
    }

    const mirrorNode: any = mirrorNodes[0];
    const mirrorContext: Context = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
    const mirrorNamespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);

    const databaseContext: Context = mirrorContext;
    const databaseNamespace: NamespaceName = NamespaceName.of('database');
    const databasePodName: string = await this.resolveExternalDbPodName(databaseNamespace, databaseContext);
    const databaseContainerName: string = 'postgresql';
    const credentials: {dbName: string; ownerUsername: string; ownerPassword: string} =
      await this.resolveMirrorDatabaseCredentials(mirrorNamespace, mirrorContext);

    return {
      context: databaseContext,
      namespace: databaseNamespace.name,
      podName: databasePodName,
      containerName: databaseContainerName,
      databaseName: credentials.dbName,
      ownerUsername: credentials.ownerUsername,
      ownerPassword: credentials.ownerPassword,
    };
  }

  /**
   * Execute pg_dump inside the DB pod and copy the SQL dump to backup output.
   * The output file is later consumed by restore-config.
   */
  private async exportExternalDatabaseBackup(
    outputDirectory: string,
    parameters: ExternalDatabaseParameters,
  ): Promise<string> {
    const databaseNamespace: NamespaceName = NamespaceName.of(parameters.namespace);
    const databasePodReference: PodReference = PodReference.of(databaseNamespace, PodName.of(parameters.podName));
    const databaseContainerReference: ContainerReference = ContainerReference.of(
      databasePodReference,
      ContainerName.of(parameters.containerName),
    );
    const databaseContainer: Container = this.k8Factory
      .getK8(parameters.context)
      .containers()
      .readByRef(databaseContainerReference);

    const dumpPathInContainer: string = '/tmp/database-dump.sql';
    await databaseContainer.execContainer([
      'env',
      `PGPASSWORD=${parameters.ownerPassword}`,
      'pg_dump',
      '-U',
      parameters.ownerUsername,
      '--clean',
      '--if-exists',
      parameters.databaseName,
      '-f',
      dumpPathInContainer,
    ]);
    await databaseContainer.copyFrom(dumpPathInContainer, outputDirectory);
    return PathEx.join(outputDirectory, 'database-dump.sql');
  }

  /**
   * Reset the target database schema before SQL import.
   * Restoring into a clean schema avoids partition/inherited-constraint cleanup failures.
   * Re-granting schema usage keeps mirror readers/writers functional after recreate.
   */
  private async resetExternalDatabaseSchema(
    databaseContainer: Container,
    credentials: {dbName: string; ownerUsername: string; ownerPassword: string},
  ): Promise<void> {
    const quotedOwnerUsername: string = `"${credentials.ownerUsername.replaceAll('"', '""')}"`;
    await databaseContainer.execContainer([
      'psql',
      `postgresql://${credentials.ownerUsername}:${credentials.ownerPassword}@localhost:5432/${credentials.dbName}`,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION ${quotedOwnerUsername}; GRANT USAGE ON SCHEMA public TO PUBLIC;`,
    ]);
  }

  /**
   * Restore an external DB SQL dump when backup artifacts are present.
   * Importer is scaled down during restore, then runtime services are restarted.
   */
  private async restoreDatabaseDumpIfPresent(inputDirectory: string): Promise<void> {
    const databaseDumpPath: string = PathEx.join(inputDirectory, 'database-dump.sql');
    if (!fs.existsSync(databaseDumpPath)) {
      this.logger.info(`No database dump found at ${databaseDumpPath}; skipping database restore`);
      return;
    }

    const mirrorNodes: any[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    if (mirrorNodes.length === 0) {
      this.logger.info('No mirror node found in deployment state; skipping database restore');
      return;
    }

    const mirrorNode: any = mirrorNodes[0];
    const mirrorContext: Context = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
    const mirrorNamespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
    const mirrorReleaseName: string = await this.resolveMirrorReleaseName(
      Number(mirrorNode.metadata.id),
      mirrorNamespace,
      mirrorContext,
    );
    const importerDeploymentName: string = `${mirrorReleaseName}-importer`;

    const parametersFromFile: ExternalDatabaseParameters = this.readExternalDatabaseParameters(inputDirectory, true);
    const databaseContext: Context = parametersFromFile.context || mirrorContext;
    const databaseNamespace: NamespaceName = NamespaceName.of(parametersFromFile.namespace || 'database');
    const explicitDatabasePodName: string = parametersFromFile.podName || '';
    const databasePodName: string =
      explicitDatabasePodName || (await this.resolveExternalDbPodName(databaseNamespace, databaseContext));
    const databaseContainerName: string = parametersFromFile.containerName || 'postgresql';

    const explicitDatabaseName: string = parametersFromFile.databaseName || '';
    const explicitOwnerUsername: string = parametersFromFile.ownerUsername || '';
    const explicitOwnerPassword: string = parametersFromFile.ownerPassword || '';

    const credentials: {dbName: string; ownerUsername: string; ownerPassword: string} =
      explicitDatabaseName && explicitOwnerUsername && explicitOwnerPassword
        ? {
            dbName: explicitDatabaseName,
            ownerUsername: explicitOwnerUsername,
            ownerPassword: explicitOwnerPassword,
          }
        : await this.resolveMirrorDatabaseCredentials(mirrorNamespace, mirrorContext);

    const mirrorK8: K8 = this.k8Factory.getK8(mirrorContext);
    const databaseK8: K8 = this.k8Factory.getK8(databaseContext);

    let importerScaledDown: boolean = false;
    try {
      await mirrorK8.manifests().scaleDeployment(mirrorNamespace.name, importerDeploymentName, 0);
      importerScaledDown = true;
    } catch (error: any) {
      this.logger.info(
        `Skipping importer scale-down for '${importerDeploymentName}' in ${mirrorNamespace.name}: ${error.message || error}`,
      );
    }
    try {
      const databasePodReference: PodReference = PodReference.of(databaseNamespace, PodName.of(databasePodName));
      const databaseContainerReference: ContainerReference = ContainerReference.of(
        databasePodReference,
        ContainerName.of(databaseContainerName),
      );
      const databaseContainer: Container = databaseK8.containers().readByRef(databaseContainerReference);
      await databaseContainer.copyTo(databaseDumpPath, '/tmp');
      await this.resetExternalDatabaseSchema(databaseContainer, credentials);
      await databaseContainer.execContainer([
        'psql',
        `postgresql://${credentials.ownerUsername}:${credentials.ownerPassword}@localhost:5432/${credentials.dbName}`,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '/tmp/database-dump.sql',
      ]);
    } finally {
      if (importerScaledDown) {
        await mirrorK8.manifests().scaleDeployment(mirrorNamespace.name, importerDeploymentName, 1);
        try {
          await mirrorK8
            .pods()
            .waitForReadyStatus(
              mirrorNamespace,
              [
                'app.kubernetes.io/name=importer',
                'app.kubernetes.io/component=importer',
                `app.kubernetes.io/instance=${mirrorReleaseName}`,
              ],
              constants.PODS_READY_MAX_ATTEMPTS,
              constants.PODS_READY_DELAY,
            );
        } catch (error: any) {
          this.logger.showUser(
            chalk.yellow(
              `Importer is not ready yet after database restore; continuing with restore flow. ` +
                `Reason: ${error.message || error}`,
            ),
          );
        }
      }
    }

    const grpcDeploymentName: string = `${mirrorReleaseName}-grpc`;
    const restDeploymentName: string = `${mirrorReleaseName}-rest`;
    await this.patchDeploymentRestartAnnotation(mirrorContext, mirrorNamespace, grpcDeploymentName);
    await this.patchDeploymentRestartAnnotation(mirrorContext, mirrorNamespace, restDeploymentName);
    await mirrorK8
      .pods()
      .waitForReadyStatus(
        mirrorNamespace,
        [
          'app.kubernetes.io/name=rest',
          'app.kubernetes.io/component=rest',
          `app.kubernetes.io/instance=${mirrorReleaseName}`,
        ],
        constants.PODS_READY_MAX_ATTEMPTS,
        constants.PODS_READY_DELAY,
      );
  }

  /**
   * Restart all consensus node pods so restored ConfigMaps/Secrets are applied.
   * This keeps restore deterministic without reinstalling components.
   */
  private async restartConsensusPods(namespace: NamespaceName, consensusNodes: ConsensusNode[]): Promise<void> {
    for (const consensusNode of consensusNodes) {
      const context: Context = helpers.extractContextFromConsensusNodes(consensusNode.name, consensusNodes);
      await this.restartPodsMatchingLabels(
        context,
        namespace,
        [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
        `consensus ${consensusNode.name}`,
      );
    }
  }

  /**
   * Rebuild relay HEDERA_NETWORK from currently assigned service endpoints.
   * Prefer in-cluster service DNS for same-cluster consensus nodes so relay does not rely on
   * externally-routed LoadBalancer IPs that may be unreachable from pod networking.
   */
  private async patchRelayHederaNetworkFromLiveServices(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
  ): Promise<void> {
    const relayNodes: any[] = this.remoteConfig.configuration.state.relayNodes || [];
    if (relayNodes.length === 0) {
      return;
    }

    const relayNode: any = relayNodes[0];
    const relayClusterReference: string = relayNode.metadata.cluster;
    const relayContext: Context = this.remoteConfig.getClusterRefs().get(relayClusterReference);
    const networkMap: Record<string, string> = {};
    for (const consensusNode of consensusNodes) {
      const nodeAlias: string = consensusNode.name;
      const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as NodeAlias, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);

      const haProxyService = await k8.services().read(namespace, `haproxy-${nodeAlias}-svc`);
      const nodeService = await k8.services().read(namespace, `network-${nodeAlias}-svc`);
      const lbOrClusterEndpoint: string =
        haProxyService.status?.loadBalancer?.ingress?.[0]?.ip || haProxyService.spec?.clusterIP || '';
      const endpointPort: number =
        haProxyService.spec?.ports?.find((port): boolean => port.name === 'non-tls-grpc-client-port')?.port || 50_211;
      const accountId: string = nodeService.metadata?.labels?.['solo.hedera.com/account-id'] || '';
      const isSameClusterAsRelay: boolean = consensusNode.cluster === relayClusterReference;
      const endpointHost: string =
        isSameClusterAsRelay
          ? `network-${nodeAlias}.${namespace.toString()}.svc.cluster.local`
          : lbOrClusterEndpoint;

      if (!endpointHost || !accountId) {
        continue;
      }
      networkMap[`${endpointHost}:${endpointPort}`] = accountId;
    }

    if (Object.keys(networkMap).length === 0) {
      return;
    }

    const relayId: number = Number(relayNode.metadata.id);
    const relayName: string = Templates.renderRelayName(relayId);
    const relayK8: K8 = this.k8Factory.getK8(relayContext);
    const patchedData: Record<string, string> = {HEDERA_NETWORK: JSON.stringify(networkMap)};

    await relayK8.configMaps().update(namespace, relayName, patchedData);
    try {
      await relayK8.configMaps().update(namespace, `${relayName}-ws`, patchedData);
    } catch (error) {
      this.logger.info(`Skipping optional relay ws patch: ${error.message}`);
    }
  }

  /**
   * Apply block-node-specific restore adjustments after config/state restore.
   * Preserve a valid earliest managed block setting and optionally restore tss-parameters.bin.
   */
  private async applyBlockNodeRestoreFixes(inputDirectory: string, _namespace: NamespaceName): Promise<void> {
    const blockNodes: any[] = this.remoteConfig.configuration.state.blockNodes || [];
    if (blockNodes.length === 0) {
      return;
    }

    const tssParametersPath: string = PathEx.join(inputDirectory, 'tss-parameters.bin');
    const shouldRestoreTssParameters: boolean = fs.existsSync(tssParametersPath);

    for (const blockNode of blockNodes) {
      const blockNodeId: number = Number(blockNode.metadata.id);
      const blockNodeContext: Context = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
      const blockNodeReleaseName: string = Templates.renderBlockNodeName(blockNodeId);
      const blockNodeNamespace: NamespaceName = NamespaceName.of(blockNode.metadata.namespace);
      const k8: K8 = this.k8Factory.getK8(blockNodeContext);
      const blockNodeConfigMapName: string = `${blockNodeReleaseName}-config`;

      // Keep the currently configured earliest block unless it is the legacy restore sentinel.
      let earliestManagedBlock: string = '0';
      try {
        const blockNodeConfigMap: ConfigMap = await k8.configMaps().read(blockNodeNamespace, blockNodeConfigMapName);
        const configuredEarliestManagedBlock: string = blockNodeConfigMap.data?.BLOCK_NODE_EARLIEST_MANAGED_BLOCK;
        if (configuredEarliestManagedBlock && configuredEarliestManagedBlock.trim().length > 0) {
          earliestManagedBlock = configuredEarliestManagedBlock.trim();
        }
      } catch (error: any) {
        this.logger.info(
          `Unable to read ${blockNodeConfigMapName} in ${blockNodeNamespace.toString()} (${blockNodeContext}); defaulting earliest block to 0. Error: ${error.message || error}`,
        );
      }
      if (earliestManagedBlock === '100000000') {
        this.logger.info(
          `Replacing legacy BLOCK_NODE_EARLIEST_MANAGED_BLOCK sentinel value for ${blockNodeConfigMapName} with 0`,
        );
        earliestManagedBlock = '0';
      }

      await k8.configMaps().update(blockNodeNamespace, blockNodeConfigMapName, {
        BLOCK_NODE_EARLIEST_MANAGED_BLOCK: earliestManagedBlock,
      });

      if (!shouldRestoreTssParameters) {
        continue;
      }

      const pods: Pod[] = await k8.pods().list(blockNodeNamespace, Templates.renderBlockNodeLabels(blockNodeId));
      if (pods.length === 0) {
        continue;
      }

      const podReference: PodReference = pods[0].podReference;
      const containerReference: ContainerReference = ContainerReference.of(
        podReference,
        constants.BLOCK_NODE_CONTAINER_NAME,
      );
      const container: Container = k8.containers().readByRef(containerReference);

      await container.execContainer([
        'sh',
        '-c',
        'rm -rf /opt/hiero/block-node/data/live/* ' +
          '/opt/hiero/block-node/data/historic/* ' +
          '/opt/hiero/block-node/verification/rootHashOfAllPreviousBlocks.bin ' +
          '/opt/hiero/block-node/verification/tss-parameters.bin 2>/dev/null || true',
      ]);
      await container.copyTo(tssParametersPath, '/opt/hiero/block-node/verification');

      await k8.pods().delete(podReference);
      await k8
        .pods()
        .waitForReadyStatus(
          blockNodeNamespace,
          Templates.renderBlockNodeLabels(blockNodeId),
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );
    }
  }

  /**
   * Restore all component configurations
   * Command: solo config ops restore-config
   */
  public async restoreConfig(argv: ArgvStruct): Promise<boolean> {
    // Load configurations
    await this.localConfig.load();
    // Restore can run while some components are temporarily down/missing (for example importer scaled to zero).
    // Load remote config without strict pod validation and let restore tasks reconcile runtime state.
    await this.remoteConfig.loadAndValidate(argv, false);

    this.configManager.update(argv);

    const inputDirectory: string = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);
    const deployment: string = this.configManager.getFlag<string>(flags.deployment);

    // Get configuration data
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const nodeAliases: string[] = consensusNodes.map((node: ConsensusNode): string => node.name);

    // Restore configmaps, secrets, and state files
    interface RestoreContext {
      configMapCount: number;
      secretCount: number;
      config: any;
    }

    const tasks: Listr<RestoreContext, any, any> = new Listr(
      [
        {
          title: 'Initialize restore configuration',
          task: async (context_, task): Promise<void> => {
            const podReferences: Record<string, PodReference> = await this.buildConsensusPodReferences(
              namespace,
              consensusNodes,
              nodeAliases,
            );

            // Initialize config object expected by uploadStateFiles
            context_.config = {
              namespace,
              consensusNodes,
              nodeAliases,
              podRefs: podReferences,
              stateFile: inputDirectory, // Not used since we pass stateFileDirectory
            };

            task.title = 'Initialize restore configuration: completed';
          },
        },
        {
          title: 'Freeze network (if running)',
          task: async (context_, task): Promise<void> => {
            try {
              // Use the existing freeze command to freeze the network
              await invokeSoloCommand(
                'Freeze network',
                'consensus network freeze',
                (): string[] => {
                  const argv: string[] = CommandHelpers.newArgv();
                  argv.push('consensus', 'network', 'freeze', '--deployment', deployment);
                  return argv;
                },
                this.taskList,
              ).task(context_, task);

              task.title = 'Freeze network: completed';
            } catch (error: any) {
              // Network is not running or already frozen, which is fine for restore
              this.logger.info(`Network freeze skipped: ${error.message}`);
              task.title = 'Freeze network: skipped (network not running)';
            }
          },
        },
        {
          title: 'Import ConfigMaps',
          task: async (context_, task): Promise<void> => {
            context_.configMapCount = await this.importConfigMaps(inputDirectory);
            task.title = `Import ConfigMaps: ${context_.configMapCount} imported`;
          },
        },
        {
          title: 'Import Secrets',
          task: async (context_, task): Promise<void> => {
            context_.secretCount = await this.importSecrets(inputDirectory);
            task.title = `Import Secrets: ${context_.secretCount} imported`;
          },
        },
        {
          title: 'Restart mirror runtime dependencies',
          task: async (context_, task): Promise<void> => {
            await this.restartMirrorRuntimeDependencies(namespace);
            task.title = 'Restart mirror runtime dependencies: completed';
          },
        },
        {
          title: 'Restore external database dump (if present)',
          task: async (context_, task): Promise<void> => {
            await this.restoreDatabaseDumpIfPresent(inputDirectory);
            task.title = 'Restore external database dump (if present): completed';
          },
        },
        {
          title: 'Restart consensus pods to pick up restored ConfigMaps/Secrets',
          task: async (context_, task): Promise<void> => {
            await this.restartConsensusPods(namespace, consensusNodes);
            context_.config.podRefs = await this.buildConsensusPodReferences(namespace, consensusNodes, nodeAliases);
            task.title = 'Restart consensus pods to pick up restored ConfigMaps/Secrets: completed';
          },
        },
        {
          title: 'Wait for consensus node pods',
          task: async (context_, task): Promise<void> => {
            await this.waitForConsensusPods();
            task.title = 'Wait for consensus node pods: completed';
          },
        },
        {
          title: 'Restore Logs and Configs',
          task: async (context_, task): Promise<void> => {
            await this.restoreLogsAndConfigs(inputDirectory);
            task.title = 'Restore Logs and Configs: completed';
          },
        },
        this.nodeCommandTasks.uploadStateFiles(false, inputDirectory),
        {
          title: 'Patch relay HEDERA_NETWORK from live services',
          task: async (context_, task): Promise<void> => {
            await this.patchRelayHederaNetworkFromLiveServices(namespace, consensusNodes);
            task.title = 'Patch relay HEDERA_NETWORK from live services: completed';
          },
        },
        {
          title: 'Apply block node restore fixes',
          task: async (context_, task): Promise<void> => {
            await this.applyBlockNodeRestoreFixes(inputDirectory, namespace);
            task.title = 'Apply block node restore fixes: completed';
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      const context_: RestoreContext = await tasks.run();

      if (!quiet) {
        this.logger.showUser('');
        this.logger.showUser(
          chalk.green(
            `✅ Restore completed: ${context_.configMapCount} configmap(s) and ${context_.secretCount} secret(s) imported`,
          ),
        );
      }
    } catch (error) {
      this.logger.showUser(chalk.red(`❌ Error during restore: ${error.message}`));
      throw error;
    }

    return true;
  }

  /**
   * Read the remote config from a local YAML file
   */
  private async readRemoteConfigFile(configFilePath: string): Promise<any> {
    this.logger.showUser(chalk.cyan(`Reading remote config from file: ${configFilePath}`));

    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        throw new SoloError(`Config file not found: ${configFilePath}`);
      }

      // Read file content
      const fileContent: string = fs.readFileSync(configFilePath, 'utf8');

      // Parse YAML
      const configData: any = yaml.parse(fileContent);

      if (!configData) {
        throw new SoloError('Config file is empty or invalid');
      }

      this.logger.showUser(chalk.green('✓ Read config file successfully'));
      return configData;
    } catch (error: any) {
      throw new SoloError(`Failed to read config file ${configFilePath}: ${error.message}`, error);
    }
  }

  /**
   * Parse the config data and instantiate RemoteConfig object
   */
  private parseRemoteConfig(configData: any): RemoteConfig {
    this.logger.showUser(chalk.cyan('Parsing remote configuration...'));

    try {
      let actualConfigData: any = configData;

      // Check if this is a ConfigMap wrapper (has apiVersion, kind, data)
      if (configData.kind === 'ConfigMap' && configData.data) {
        this.logger.showUser(chalk.gray('  Detected ConfigMap format, extracting remote config data...'));

        // Extract the remote config from the ConfigMap data field
        const remoteConfigKey: string = 'remote-config-data';
        const remoteConfigYaml: any = configData.data[remoteConfigKey];

        if (!remoteConfigYaml) {
          throw new SoloError(`ConfigMap does not contain '${remoteConfigKey}' key`);
        }

        // Parse the YAML string to get the actual config object
        actualConfigData = yaml.parse(remoteConfigYaml);
        this.logger.showUser(chalk.gray('  ✓ Extracted remote config from ConfigMap'));
      }

      // Transform to RemoteConfigSchema instance
      const remoteConfigSchema: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, actualConfigData, {
        excludeExtraneousValues: true,
      });

      const remoteConfig: RemoteConfig = new RemoteConfig(remoteConfigSchema);
      this.logger.showUser(chalk.green('✓ Remote configuration parsed successfully'));

      return remoteConfig;
    } catch (error: any) {
      throw new SoloError(`Failed to parse remote config: ${error.message}`, error);
    }
  }

  private buildDeploymentTasks(): SoloListrTask<any>[] {
    const tasks: SoloListrTask<any>[] = [];

    return [
      ...tasks,
      // Keys generation task
      {
        title: 'Generate consensus node keys',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          return CommandHelpers.subTaskSoloCommand(
            KeysCommandDefinition.KEYS_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.generateGossipKeys),
                CommandHelpers.optionFromFlag(flags.generateTlsKeys),
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment,
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases,
              );
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      ...this.buildBlockNodeTasks(),
      // Consensus network deploy task
      {
        title: 'Deploy consensus network',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.DEPLOY_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();

              // Use options from options file if provided, otherwise use default
              if (context_.componentOptions?.consensus) {
                // Add command name first
                argv.push(
                  ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                  ...context_.componentOptions.consensus,
                );
              } else {
                // Default behavior
                argv.push(
                  ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                  CommandHelpers.optionFromFlag(flags.deployment),
                  context_.deployment,
                  CommandHelpers.optionFromFlag(flags.persistentVolumeClaims),
                );

                // Enable load balancer if multiple clusters are detected
                if (context_.clusters && context_.clusters.length > 1) {
                  argv.push(CommandHelpers.optionFromFlag(flags.loadBalancerEnabled));
                  this.logger.info(`Multiple clusters detected (${context_.clusters.length}), enabling load balancer`);
                }

                if (context_.versions?.consensusNode) {
                  argv.push(
                    CommandHelpers.optionFromFlag(flags.releaseTag),
                    context_.versions.consensusNode.toString(),
                  );
                }
                if (context_.versions?.chart) {
                  argv.push(CommandHelpers.optionFromFlag(flags.soloChartVersion), context_.versions.chart.toString());
                }
              }
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      // Consensus node setup task
      {
        title: 'Setup consensus nodes',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.SETUP_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases,
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment,
              );
              if (context_.versions?.consensusNode) {
                argv.push(CommandHelpers.optionFromFlag(flags.releaseTag), context_.versions.consensusNode.toString());
              }
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      // Block nodes deploy tasks (one per block node)
      ...this.buildMirrorNodeTasks(),
      ...this.buildRelayNodeTasks(),
      ...this.buildExplorerTasks(),
    ];
  }

  /**
   * Build block node deployment tasks
   */
  private buildBlockNodeTasks(): SoloListrTask<any>[] {
    return [
      {
        title: 'Deploy block nodes',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.blockNodes || context_.deploymentState.blockNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<any> => {
          const blockNodeTasks: any[] = [];

          for (const blockNode of context_.deploymentState.blockNodes) {
            blockNodeTasks.push({
              title: `Deploy block node ${blockNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this block node
                const clusterReference: string | undefined = blockNode.metadata.cluster;
                if (blockNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${blockNode.metadata.context}' for block node ${blockNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(blockNode.metadata.context);
                  k8.contexts().updateCurrent(blockNode.metadata.context);
                }

                return subTaskSoloCommand(
                  BlockCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.block) {
                      // Add command name first
                      argv.push(...BlockCommandDefinition.ADD_COMMAND.split(' '), ...context_.componentOptions.block);
                    } else {
                      // Default behavior
                      argv.push(
                        ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.blockNodeChart) {
                        argv.push(
                          optionFromFlag(flags.blockNodeChartVersion),
                          context_.versions.blockNodeChart.toString(),
                        );
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(blockNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build mirror node deployment tasks
   */
  private buildMirrorNodeTasks(): SoloListrTask<any>[] {
    return [
      {
        title: 'Deploy mirror nodes',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.mirrorNodes || context_.deploymentState.mirrorNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<any> => {
          const mirrorNodeTasks: any[] = [];

          for (const mirrorNode of context_.deploymentState.mirrorNodes) {
            mirrorNodeTasks.push({
              title: `Deploy mirror node ${mirrorNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this mirror node
                const clusterReference: string | undefined = mirrorNode.metadata.cluster;
                if (mirrorNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${mirrorNode.metadata.context}' for mirror node ${mirrorNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(mirrorNode.metadata.context);
                  k8.contexts().updateCurrent(mirrorNode.metadata.context);
                }

                return subTaskSoloCommand(
                  MirrorCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.mirror) {
                      // Add command name first
                      argv.push(...MirrorCommandDefinition.ADD_COMMAND.split(' '), ...context_.componentOptions.mirror);
                    } else {
                      // Default behavior
                      argv.push(
                        ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.mirrorNodeChart) {
                        argv.push(
                          optionFromFlag(flags.mirrorNodeVersion),
                          context_.versions.mirrorNodeChart.toString(),
                        );
                      }
                    }
                    // Build address book from local keys — CN is not running during restore-network
                    argv.push(CommandHelpers.optionFromFlag(flags.localAddressBook));
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(mirrorNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build relay node deployment tasks
   */
  private buildRelayNodeTasks(): SoloListrTask<any>[] {
    return [
      {
        title: 'Deploy relay nodes',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.relayNodes || context_.deploymentState.relayNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<any> => {
          const relayNodeTasks: any[] = [];

          for (const relayNode of context_.deploymentState.relayNodes) {
            relayNodeTasks.push({
              title: `Deploy relay node ${relayNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this relay node
                const clusterReference: string | undefined = relayNode.metadata.cluster;
                if (relayNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${relayNode.metadata.context}' for relay node ${relayNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(relayNode.metadata.context);
                  k8.contexts().updateCurrent(relayNode.metadata.context);
                }

                return subTaskSoloCommand(
                  RelayCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.relay) {
                      // Add command name first
                      argv.push(...RelayCommandDefinition.ADD_COMMAND.split(' '), ...context_.componentOptions.relay);
                    } else {
                      // Default behavior
                      argv.push(
                        ...RelayCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                        context_.nodeAliases,
                      );
                      // Add cluster ref if node has cluster metadata
                      if (clusterReference) {
                        argv.push(optionFromFlag(flags.clusterRef), clusterReference);
                      }
                      if (context_.versions?.jsonRpcRelayChart) {
                        argv.push(
                          optionFromFlag(flags.relayReleaseTag),
                          context_.versions.jsonRpcRelayChart.toString(),
                        );
                      }
                    }
                    // Skip relay readiness checks — CN is not running during restore-network
                    argv.push(CommandHelpers.optionFromFlag(flags.skipRelayReadiness));
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(relayNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build explorer deployment tasks
   */
  private buildExplorerTasks(): SoloListrTask<any>[] {
    return [
      {
        title: 'Deploy explorers',
        skip: (context_: any): boolean =>
          !context_.deploymentState?.explorers || context_.deploymentState.explorers.length === 0,
        task: async (context_, taskListWrapper): Promise<any> => {
          const explorerTasks: any[] = [];

          for (const explorer of context_.deploymentState.explorers) {
            explorerTasks.push({
              title: `Deploy explorer ${explorer.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this explorer
                const clusterReference: string | undefined = explorer.metadata.cluster;
                if (explorer.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${explorer.metadata.context}' for explorer ${explorer.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(explorer.metadata.context);
                  k8.contexts().updateCurrent(explorer.metadata.context);
                }

                return subTaskSoloCommand(
                  ExplorerCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.explorer) {
                      // Add command name first
                      argv.push(
                        ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                        ...context_.componentOptions.explorer,
                      );
                    } else {
                      // Default behavior
                      argv.push(
                        ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.explorerChart) {
                        argv.push(optionFromFlag(flags.explorerVersion), context_.versions.explorerChart.toString());
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(explorerTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build scan backup directory task
   */
  private buildScanBackupDirectoryTask(): SoloListrTask<any> {
    return {
      title: 'Scan backup directory structure',
      task: async (context_: any): Promise<void> => {
        const inputDirectory: string = context_.inputDirectory;

        // Verify input directory exists
        if (!fs.existsSync(inputDirectory)) {
          throw new SoloError(`Input directory does not exist: ${inputDirectory}`);
        }

        // Read subdirectories
        const entries: fs.Dirent[] = fs.readdirSync(inputDirectory, {withFileTypes: true});
        const clusterReferenceDirectories: string[] = entries
          .filter((entry): boolean => entry.isDirectory())
          .map((entry): string => entry.name);

        if (clusterReferenceDirectories.length === 0) {
          throw new SoloError(`No cluster directories found in: ${inputDirectory}`);
        }

        // Store cluster reference directory names for mapping to kubectl contexts later
        context_.contextDirs = clusterReferenceDirectories;

        this.logger.showUser(
          chalk.cyan(
            `\nFound ${clusterReferenceDirectories.length} cluster(s): ${clusterReferenceDirectories.join(', ')}`,
          ),
        );

        // Read solo-remote-config.yaml from the first cluster's configmaps directory
        const firstClusterReference: string = clusterReferenceDirectories[0];
        const configPath: string = PathEx.join(
          inputDirectory,
          firstClusterReference,
          'configmaps',
          'solo-remote-config.yaml',
        );

        if (!fs.existsSync(configPath)) {
          throw new SoloError(
            `solo-remote-config.yaml not found at: ${configPath}. Expected structure: <input-dir>/<cluster-ref>/configmaps/solo-remote-config.yaml`,
          );
        }

        this.logger.showUser(chalk.cyan(`Reading configuration from: ${configPath}`));

        // Read and parse the config file
        const configData: any = await this.readRemoteConfigFile(configPath);
        context_.remoteConfig = this.parseRemoteConfig(configData);
        context_.deploymentState = context_.remoteConfig.state;
        context_.versions = context_.remoteConfig.versions;

        // Use clusters from config file (they contain cluster reference names, not kubectl context names)
        if (!context_.remoteConfig.clusters || context_.remoteConfig.clusters.length === 0) {
          throw new SoloError('No cluster information found in configuration file');
        }

        context_.clusters = context_.remoteConfig.clusters;

        // Log cluster information from config
        const clusterNames: string = context_.clusters.map((c: any) => c.name).join(', ');
        this.logger.showUser(chalk.cyan(`Clusters from config: ${clusterNames}`));

        // Validate: number of cluster directories should match number of clusters in config
        if (clusterReferenceDirectories.length !== context_.clusters.length) {
          this.logger.showUser(
            chalk.yellow(
              `Warning: Found ${clusterReferenceDirectories.length} cluster directory(ies) but config has ${context_.clusters.length} cluster(s)`,
            ),
          );
        }

        // Extract deployment info from config (use first cluster)
        const clusterInfo: any = context_.remoteConfig.clusters[0];
        context_.namespace = NamespaceName.of(clusterInfo.namespace);
        context_.deployment = clusterInfo.deployment as DeploymentName;
        context_.context = clusterInfo.name; // Cluster name is the context

        this.logger.showUser(chalk.cyan(`\nDeployment: ${context_.deployment}`));
        this.logger.showUser(chalk.cyan(`Namespace: ${context_.namespace.name}`));
        this.logger.showUser(chalk.cyan(`Context: ${context_.context}`));

        // Build node aliases and validate we have components to deploy
        if (context_.deploymentState!.consensusNodes && context_.deploymentState!.consensusNodes.length > 0) {
          context_.nodeAliases = context_
            .deploymentState!.consensusNodes.map((n: any): `node${string}` => `node${n.metadata.id}`)
            .join(',');
          context_.numConsensusNodes = context_.deploymentState!.consensusNodes.length;
        }

        const hasComponents: boolean =
          (context_.deploymentState!.consensusNodes?.length || 0) > 0 ||
          (context_.deploymentState!.blockNodes?.length || 0) > 0 ||
          (context_.deploymentState!.mirrorNodes?.length || 0) > 0 ||
          (context_.deploymentState!.relayNodes?.length || 0) > 0 ||
          (context_.deploymentState!.explorers?.length || 0) > 0;

        if (!hasComponents) {
          throw new SoloError('No components found in deployment state to deploy');
        }
      },
    };
  }

  /**
   * Normalize component options file paths before subcommands are invoked.
   * Relative values files are resolved from the options YAML location.
   */
  private normalizeComponentOptionsFilePaths(parsedOptions: any, optionsFile: string): void {
    const optionsDirectory: string = path.dirname(path.resolve(optionsFile));
    const componentNames: string[] = ['consensus', 'block', 'mirror', 'relay', 'explorer'];

    for (const componentName of componentNames) {
      const rawArguments: unknown = parsedOptions?.[componentName];
      if (!Array.isArray(rawArguments)) {
        continue;
      }

      parsedOptions[componentName] = this.resolveRelativeValuesFileArgs(rawArguments, optionsDirectory);
    }
  }

  /**
   * Resolve relative --values-file arguments against the options file directory.
   * This lets restore-network consume component options without external shell path rewriting.
   */
  private resolveRelativeValuesFileArgs(rawArguments: unknown[], optionsDirectory: string): string[] {
    const resolvedArguments: string[] = rawArguments.map(String);

    for (let index: number = 0; index < resolvedArguments.length; index++) {
      const token: string = resolvedArguments[index];
      if (token === '--values-file') {
        const nextIndex: number = index + 1;
        const rawPath: string = resolvedArguments[nextIndex] || '';
        if (rawPath && !rawPath.startsWith('-') && !path.isAbsolute(rawPath)) {
          resolvedArguments[nextIndex] = path.resolve(optionsDirectory, rawPath);
        }
        continue;
      }

      if (token.startsWith('--values-file=')) {
        const rawPath: string = token.slice('--values-file='.length);
        if (rawPath && !path.isAbsolute(rawPath)) {
          resolvedArguments[index] = `--values-file=${path.resolve(optionsDirectory, rawPath)}`;
        }
      }
    }

    return resolvedArguments;
  }

  /**
   * Build shared initialization task for restore commands
   */
  private buildInitializationTask(argv: ArgvStruct): SoloListrTask<any> {
    return {
      title: 'Initialize configuration',
      task: async (context_: any) => {
        await this.localConfig.load();
        this.configManager.update(argv);

        const inputDirectory: string = argv[flags.inputDir.name] as string;
        if (!inputDirectory) {
          throw new SoloError('Input directory is required. Use --input-dir flag.');
        }
        context_.inputDirectory = inputDirectory;

        // Load component-specific options from YAML file if provided
        const optionsFile: string = argv[flags.optionsFile.name] as string;
        if (optionsFile) {
          this.logger.showUser(chalk.cyan(`\nLoading component options from: ${optionsFile}`));

          if (!fs.existsSync(optionsFile)) {
            throw new SoloError(`Options file not found: ${optionsFile}`);
          }

          try {
            const optionsContent: string = fs.readFileSync(optionsFile, 'utf8');
            const parsedOptions: any = yaml.parse(optionsContent);
            this.normalizeComponentOptionsFilePaths(parsedOptions, optionsFile);
            context_.componentOptions = parsedOptions;

            this.logger.showUser(chalk.cyan('Component options loaded:'));
            if (parsedOptions.consensus) {
              this.logger.showUser(chalk.gray(`  - consensus: ${parsedOptions.consensus.length} options`));
            }
            if (parsedOptions.block) {
              this.logger.showUser(chalk.gray(`  - block: ${parsedOptions.block.length} options`));
            }
            if (parsedOptions.mirror) {
              this.logger.showUser(chalk.gray(`  - mirror: ${parsedOptions.mirror.length} options`));
            }
            if (parsedOptions.relay) {
              this.logger.showUser(chalk.gray(`  - relay: ${parsedOptions.relay.length} options`));
            }
            if (parsedOptions.explorer) {
              this.logger.showUser(chalk.gray(`  - explorer: ${parsedOptions.explorer.length} options`));
            }
          } catch (error) {
            throw new SoloError(`Failed to parse options file: ${error.message}`, error);
          }
        }
      },
    };
  }

  private async extractEncryptedBackup(targetDirectory: string, task: any): Promise<void> {
    const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
    if (!zipPassword) {
      return;
    }

    const zipInputFile: string = this.configManager.getFlag<string>(flags.zipFile);
    if (!zipInputFile) {
      throw new SoloError('--zip-file is required when using --zip-password.');
    }

    const inputPath: string = path.resolve(zipInputFile);
    if (!fs.existsSync(inputPath)) {
      throw new SoloError(`Input path does not exist: ${inputPath}`);
    }

    const inputStats: fs.Stats = fs.statSync(inputPath);
    if (!inputStats.isFile()) {
      this.logger.showUser(chalk.yellow('Provided zip input path points to a directory; skipping extraction.'));
      return;
    }

    if (path.extname(inputPath).toLowerCase() !== '.zip') {
      throw new SoloError('Input path must be a .zip file when using --zip-password.');
    }

    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, {recursive: true});
    }

    const unzipCommand: string = `unzip -o -P "${zipPassword}" "${inputPath}" -d "${targetDirectory}"`;
    const shellRunner: ShellRunner = new ShellRunner(this.logger);
    await shellRunner.run(unzipCommand, [], true, false);

    this.configManager.setFlag(flags.inputDir, targetDirectory);

    if (task) {
      task.title = `Extract backup archive: ${targetDirectory}`;
    }

    this.logger.showUser(
      chalk.green(
        `\n✓ Backup archive extracted to ${targetDirectory}\nUse this directory for subsequent restore commands.`,
      ),
    );
  }

  /**
   * Build create Kind clusters tasks
   */
  private buildKindNetworkTask(): SoloListrTask<any>[] {
    const tasks: SoloListrTask<any>[] = [
      {
        title: 'Setup Docker network for multi-cluster',
        skip: (context_: any): boolean => !context_.clusters || context_.clusters.length <= 1,
        task: async (context_: any): Promise<void> => {
          this.logger.info(`Multiple clusters detected (${context_.clusters.length}), creating Kind Docker network...`);
          try {
            const shellRunner: ShellRunner = new ShellRunner(this.logger);
            await shellRunner.run(
              'docker network rm -f kind || true && docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge',
            );

            // Add MetalLB Helm repository for multi-cluster load balancing
            this.logger.info('Adding MetalLB Helm repository...');
            await this.helm.addRepository(new Repository('metallb', 'https://metallb.github.io/metallb'));
            await this.helm.updateRepositories();
          } catch (error: any) {
            // Network might already exist, which is fine
            if (error.message && error.message.includes('already exists')) {
              this.logger.info('Kind Docker network already exists, continuing...');
            } else {
              throw new SoloError(`Failed to create Kind Docker network or add MetalLB repo: ${error.message}`, error);
            }
          }
        },
      },
    ];

    // Add individual cluster creation tasks
    return tasks;
  }

  /**
   * Build individual cluster creation tasks
   */
  private buildIndividualClusterCreationTasks(
    context_: any,
    metallbConfig: string = 'metallb-cluster-{index}.yaml',
  ): SoloListrTask<any>[] {
    const clusterTasks: SoloListrTask<any>[] = [];
    const isMultiCluster: boolean = context_.clusters.length > 1;

    // Create a task for each cluster
    for (let clusterIndex: number = 0; clusterIndex < context_.clusters.length; clusterIndex++) {
      const cluster: any = context_.clusters[clusterIndex];

      // Get the cluster reference from directory name
      // This is used as the base name for Kind cluster creation
      const clusterReferenceFromDirectory: string = context_.contextDirs![clusterIndex];
      // if clusterReferenceFromDirectory already has "kind-" prefix, remove it
      const clusterNameForCreation: string = clusterReferenceFromDirectory.replace('kind-', '');

      clusterTasks.push({
        title: `Create cluster '${clusterNameForCreation}' (cluster ref: ${cluster.name})`,
        task: async (_: any, task: any): Promise<void> => {
          const kindExecutable: string = await this.depManager.getExecutable(constants.KIND);
          const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();
          const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(clusterNameForCreation);
          task.title = `Created cluster '${clusterResponse.name}' with context '${clusterResponse.context}'`;

          // Wait for cluster control plane to be ready by checking API server
          this.logger.info(`Waiting for cluster '${clusterResponse.context}' control plane to be ready...`);
          const maxAttempts: number = 60; // 60 attempts * 2 seconds = 120 seconds max
          let attempt: number = 0;
          let clusterReady: boolean = false;

          while (attempt < maxAttempts && !clusterReady) {
            try {
              const k8: K8 = this.k8Factory.getK8(clusterResponse.context);
              // Try to list namespaces as a simple API readiness check
              await k8.namespaces().list();
              clusterReady = true;
              this.logger.info(`Cluster '${clusterResponse.context}' is ready after ${(attempt + 1) * 2} seconds`);
              task.title = `Created cluster '${clusterResponse.name}' (ready in ${(attempt + 1) * 2}s)`;
            } catch (error: any) {
              attempt++;
              if (attempt < maxAttempts) {
                await helpers.sleep(Duration.ofSeconds(2));
              } else {
                throw new SoloError(
                  `Cluster '${clusterResponse.context}' failed to become ready after ${maxAttempts * 2} seconds. The API server is not responding. Error: ${error.message}`,
                );
              }
            }
          }

          // Set the current kubectl context to the newly created cluster
          this.logger.info(`Setting current context to '${clusterResponse.context}'`);
          const k8: K8 = this.k8Factory.getK8(clusterResponse.context);
          k8.contexts().updateCurrent(clusterResponse.context);

          // Install MetalLB for multi-cluster setups
          if (isMultiCluster) {
            this.logger.info(`Installing MetalLB on cluster '${clusterResponse.context}'...`);
            // Install MetalLB using Helm
            await this.helm.installChart(
              'metallb',
              new Chart('metallb', 'metallb'),
              InstallChartOptionsBuilder.builder()
                .namespace('metallb-system')
                .createNamespace(true)
                .atomic(true)
                .waitFor(true)
                .set(['speaker.frr.enabled=true'])
                .kubeContext(clusterResponse.context)
                .build(),
            );

            // Apply cluster-specific MetalLB configuration
            const metallbConfigPath: string = metallbConfig.replace('{index}', String(clusterIndex + 1));
            this.logger.info(`Applying MetalLB config from '${metallbConfigPath}'...`);
            await k8.manifests().applyManifest(metallbConfigPath);

            task.title = `Created cluster '${clusterResponse.name}' with MetalLB`;
          }
        },
      });
    }

    return clusterTasks;
  }

  /**
   * Build cluster initialization tasks
   */
  private buildClusterInitializationTasks(context_: any, shard: number = 0, realm: number = 0): any[] {
    const initTasks: any[] = [];
    const createdDeployments: Set<string> = new Set<string>(); // Track deployments already created

    // For each cluster, run the initialization commands
    for (const cluster of context_.clusters!) {
      const clusterReference: string = cluster.name;
      // if cluster is created by kind, then context name is kind-<clusterReference>
      const contextName: string = clusterReference.startsWith('kind-') ? clusterReference : `kind-${clusterReference}`;
      const namespace: string = cluster.namespace;
      const deployment: string = cluster.deployment;

      // Count consensus nodes belonging to this specific cluster
      // Note: nodes may have cluster saved with or without prefix, so check both
      const clusterConsensusNodeCount: number = context_.deploymentState!.consensusNodes.filter(
        (node: any): boolean => {
          return node.metadata.cluster === clusterReference;
        },
      ).length;

      this.logger.info(
        `Initializing cluster: clusterForKind='${clusterReference}', clusterRef='${clusterReference}', kubectlContext='${contextName}', consensusNodes=${clusterConsensusNodeCount}`,
      );

      initTasks.push(
        // Initialize Solo for the cluster
        invokeSoloCommand(
          `Initialize Solo for cluster '${clusterReference}'`,
          'init',
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push('init');
            return argv;
          },
          this.taskList,
        ),
        invokeSoloCommand(
          `Connect to cluster '${contextName}'`,
          ClusterReferenceCommandDefinition.CONNECT_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
              optionFromFlag(flags.context),
              contextName,
            );
            return argv;
          },
          this.taskList,
        ),
        invokeSoloCommand(
          `Setup cluster-ref '${clusterReference}'`,
          ClusterReferenceCommandDefinition.SETUP_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
            );
            return argv;
          },
          this.taskList,
        ),
      );

      // Only create deployment if not already created (multiple clusters may share the same deployment)
      if (!createdDeployments.has(deployment)) {
        initTasks.push(
          invokeSoloCommand(
            `Create deployment '${deployment}'`,
            DeploymentCommandDefinition.CREATE_COMMAND,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
                optionFromFlag(flags.deployment),
                deployment,
                optionFromFlag(flags.namespace),
                namespace,
                optionFromFlag(flags.shard),
                shard.toString(),
                optionFromFlag(flags.realm),
                realm.toString(),
              );
              return argv;
            },
            this.taskList,
          ),
        );
        createdDeployments.add(deployment);
      }

      initTasks.push(
        invokeSoloCommand(
          `Attach cluster reference '${clusterReference}' to deployment '${deployment}' with ${clusterConsensusNodeCount} consensus nodes`,
          DeploymentCommandDefinition.ATTACH_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
              optionFromFlag(flags.deployment),
              deployment,
              optionFromFlag(flags.numberOfConsensusNodes),
              clusterConsensusNodeCount.toString(),
            );
            return argv;
          },
          this.taskList,
        ),
      );
    }

    return initTasks;
  }

  private parseExpectedLbIpAssignments(expectedLbIpsFile: string): ExpectedLbIpAssignment[] {
    const resolvedPath: string = PathEx.resolve(expectedLbIpsFile);
    if (!fs.existsSync(resolvedPath)) {
      throw new SoloError(`Expected LB IP file not found: ${resolvedPath}`);
    }

    const assignments: ExpectedLbIpAssignment[] = [];
    const lines: string[] = fs.readFileSync(resolvedPath, 'utf8').split('\n');
    const entryPattern: RegExp = /^KIND_(.+)_(ENVOY_PROXY|HAPROXY|NETWORK)_NODE(\d+)_SVC$/;

    for (const line of lines) {
      const entry: string = line.trim();
      if (!entry || entry.startsWith('#')) {
        continue;
      }

      const equalsIndex: number = entry.indexOf('=');
      if (equalsIndex <= 0) {
        continue;
      }

      const key: string = entry.slice(0, equalsIndex).trim();
      const value: string = entry
        .slice(equalsIndex + 1)
        .trim()
        .replaceAll(/^['"]|['"]$/g, '');
      if (!key || !value) {
        continue;
      }

      const match: RegExpMatchArray | null = key.match(entryPattern);
      if (!match) {
        continue;
      }

      const contextSuffix: string = match[1].toLowerCase().replaceAll('_', '-');
      const context: Context = `kind-${contextSuffix}`;
      const serviceTypeToken: string = match[2];
      const nodeId: string = match[3];

      let servicePrefix: string;
      switch (serviceTypeToken) {
        case 'ENVOY_PROXY': {
          servicePrefix = 'envoy-proxy';
          break;
        }
        case 'HAPROXY': {
          servicePrefix = 'haproxy';
          break;
        }
        case 'NETWORK': {
          servicePrefix = 'network';
          break;
        }
        default: {
          continue;
        }
      }

      assignments.push({
        context,
        serviceName: `${servicePrefix}-node${nodeId}-svc`,
        expectedIp: value,
      });
    }

    if (assignments.length === 0) {
      throw new SoloError(
        `No supported LoadBalancer IP entries found in ${resolvedPath}. ` +
          'Expected keys like KIND_<CONTEXT>_<ENVOY_PROXY|HAPROXY|NETWORK>_NODE<n>_SVC=<ip>',
      );
    }

    return assignments;
  }

  private getServiceLoadBalancerIp(service: Service): string {
    return service.status?.loadBalancer?.ingress?.[0]?.ip || '';
  }

  /**
   * Find which service currently owns a target LoadBalancer IP in a context.
   * Used to detect conflicting ownership before reassignment.
   */
  private async findServiceOwningLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    expectedIp: string,
  ): Promise<string> {
    const services: Service[] = await this.k8Factory.getK8(context).services().list(namespace, []);
    const ownerService: Service | undefined = services.find(
      (service: Service): boolean => this.getServiceLoadBalancerIp(service) === expectedIp,
    );
    return ownerService?.metadata?.name || '';
  }

  /**
   * Clear MetalLB IP annotations from a service to force unassignment.
   * This is the first phase before reapplying expected IP ownership.
   */
  private async unassignServiceLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    serviceName: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          namespace: namespace.name,
          name: serviceName,
          annotations: {
            'metallb.universe.tf/loadBalancerIPs': null,
            'metallb.io/loadBalancerIPs': null,
          },
        },
        spec: {
          loadBalancerIP: null,
        },
      });
  }

  /**
   * Assign an expected LoadBalancer IP to a service via MetalLB annotations.
   * This drives deterministic service endpoint restoration after redeploy.
   */
  private async assignServiceLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    serviceName: string,
    expectedIp: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          namespace: namespace.name,
          name: serviceName,
          annotations: {
            'metallb.universe.tf/loadBalancerIPs': expectedIp,
            'metallb.io/loadBalancerIPs': expectedIp,
          },
        },
      });
  }

  /**
   * Verify all services currently advertise their expected LoadBalancer IPs.
   * Returns false immediately on the first mismatch.
   */
  private async hasAllExpectedLoadBalancerIps(
    namespace: NamespaceName,
    assignments: ExpectedLbIpAssignment[],
  ): Promise<boolean> {
    for (const assignment of assignments) {
      const service: Service = await this.k8Factory
        .getK8(assignment.context)
        .services()
        .read(namespace, assignment.serviceName);
      const actualIp: string = this.getServiceLoadBalancerIp(service);
      if (actualIp !== assignment.expectedIp) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rollout restart MetalLB controllers in involved contexts.
   * Used as a recovery step when IP assignment does not converge.
   */
  private async restartMetalLbControllers(assignments: ExpectedLbIpAssignment[]): Promise<void> {
    const contexts: Set<Context> = new Set(
      assignments.map((assignment: ExpectedLbIpAssignment): Context => assignment.context),
    );
    for (const context of contexts) {
      try {
        await this.patchDeploymentRestartAnnotation(context, NamespaceName.of('metallb-system'), 'metallb-controller');
      } catch (error: any) {
        this.logger.info(`Skipping MetalLB controller restart for context '${context}': ${error.message}`);
      }
    }
  }

  /**
   * Enforce expected service IP ownership from the configured assignment file.
   * Flow: detect conflicts, unassign, reassign, verify, and fallback restart MetalLB if needed.
   */
  private async enforceExpectedLoadBalancerIps(namespace: NamespaceName, expectedLbIpsFile: string): Promise<void> {
    const assignments: ExpectedLbIpAssignment[] = this.parseExpectedLbIpAssignments(expectedLbIpsFile);

    for (const assignment of assignments) {
      const ownerServiceName: string = await this.findServiceOwningLoadBalancerIp(
        assignment.context,
        namespace,
        assignment.expectedIp,
      );
      if (ownerServiceName && ownerServiceName !== assignment.serviceName) {
        this.logger.info(
          `LB IP ownership warning: context='${assignment.context}' service='${assignment.serviceName}' ` +
            `expected='${assignment.expectedIp}' currentlyOwnedBy='${ownerServiceName}'`,
        );
      }
    }

    for (const assignment of assignments) {
      await this.unassignServiceLoadBalancerIp(assignment.context, namespace, assignment.serviceName);
    }

    for (const assignment of assignments) {
      await this.assignServiceLoadBalancerIp(
        assignment.context,
        namespace,
        assignment.serviceName,
        assignment.expectedIp,
      );
    }

    for (let attempt: number = 0; attempt < 45; attempt++) {
      if (await this.hasAllExpectedLoadBalancerIps(namespace, assignments)) {
        return;
      }
      await helpers.sleep(Duration.ofSeconds(2));
    }

    this.logger.info('LoadBalancer IPs did not converge after initial retries. Restarting MetalLB controllers...');
    await this.restartMetalLbControllers(assignments);

    for (let attempt: number = 0; attempt < 30; attempt++) {
      if (await this.hasAllExpectedLoadBalancerIps(namespace, assignments)) {
        return;
      }
      await helpers.sleep(Duration.ofSeconds(2));
    }

    const mismatches: string[] = [];
    for (const assignment of assignments) {
      const service: Service = await this.k8Factory
        .getK8(assignment.context)
        .services()
        .read(namespace, assignment.serviceName);
      const actualIp: string = this.getServiceLoadBalancerIp(service);
      if (actualIp !== assignment.expectedIp) {
        mismatches.push(
          `${assignment.context}/${assignment.serviceName}: expected ${assignment.expectedIp}, got ${actualIp || '<none>'}`,
        );
      }
    }

    throw new SoloError(`Failed to enforce expected LoadBalancer IPs:\n${mismatches.join('\n')}`);
  }

  /**
   * Restore Kind clusters from backup directory structure
   * Command: solo config ops restore-clusters
   */
  public async restoreClusters(argv: ArgvStruct): Promise<boolean> {
    await this.depManager.checkDependency(constants.KIND);
    await this.depManager.checkDependency(constants.HELM);

    // Extract metallbConfig from argv
    const metallbConfig: string = (argv[flags.metallbConfig.name] as string) ?? 'metallb-cluster-{index}.yaml';

    interface RestoreClustersContext {
      inputDirectory: string;
      contextDirs?: string[]; // kubectl context directory names from backup
      remoteConfig?: RemoteConfig;
      deploymentState?: DeploymentStateSchema;
      namespace?: NamespaceName;
      deployment?: DeploymentName;
      context?: Context;
      nodeAliases?: string;
      versions?: ApplicationVersionsSchema;
      clusters?: ReadonlyArray<Readonly<ClusterSchema>>;
      numConsensusNodes?: number;
      componentOptions?: {
        consensus?: string[];
        block?: string[];
        mirror?: string[];
        relay?: string[];
        explorer?: string[];
      };
    }

    const tasks: any = new Listr<RestoreClustersContext>(
      [
        this.buildInitializationTask(argv),
        {
          title: 'Extract backup archive',
          skip: (): boolean => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            return !zipPassword;
          },
          task: async (context_: RestoreClustersContext, task): Promise<void> => {
            await this.extractEncryptedBackup(context_.inputDirectory, task);
          },
        },
        // Flatten scan backup directory task
        this.buildScanBackupDirectoryTask(),
        ...this.buildKindNetworkTask(),
        {
          title: 'Create individual clusters',
          task: (context_: any, taskListWrapper: any): any => {
            const clusterTasks: SoloListrTask<any>[] = this.buildIndividualClusterCreationTasks(
              context_,
              metallbConfig,
            );
            return taskListWrapper.newListr(clusterTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
    );

    try {
      await tasks.run();
      this.logger.showUser(chalk.green('\n✅ Clusters restored successfully!'));
      this.logger.showUser(
        chalk.cyan(
          '\nℹ️  Clusters have been created and initialized. Run "solo config ops restore-network" to deploy network components.',
        ),
      );
    } catch (error: any) {
      throw new SoloError(`Restore clusters failed: ${error.message}`, error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error: any): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }

  /**
   * Deploy network components to existing clusters from backup
   * Command: solo config ops restore-network
   */
  public async restoreNetwork(argv: ArgvStruct): Promise<boolean> {
    // Extract shard and realm from argv
    const shard: number = (argv[flags.shard.name] as number) ?? 0;
    const realm: number = (argv[flags.realm.name] as number) ?? 0;
    const expectedLbIpsFile: string = (argv[flags.expectedLbIpsFile.name] as string) || '';
    const skipIpTracking: boolean = (argv[flags.skipIpTracking.name] as boolean) ?? true;

    if (!skipIpTracking && !expectedLbIpsFile) {
      throw new SoloError(`--${flags.expectedLbIpsFile.name} is required when --${flags.skipIpTracking.name}=false`);
    }
    if (skipIpTracking && expectedLbIpsFile) {
      this.logger.info(
        `Skipping expected LoadBalancer IP enforcement because --${flags.skipIpTracking.name}=true (default)`,
      );
    }

    interface RestoreNetworkContext {
      inputDirectory: string;
      contextDirs?: string[]; // kubectl context directory names from backup
      remoteConfig?: RemoteConfig;
      deploymentState?: DeploymentStateSchema;
      namespace?: NamespaceName;
      deployment?: DeploymentName;
      context?: Context;
      nodeAliases?: string;
      versions?: ApplicationVersionsSchema;
      clusters?: ReadonlyArray<Readonly<ClusterSchema>>;
      numConsensusNodes?: number;
      componentOptions?: {
        consensus?: string[];
        block?: string[];
        mirror?: string[];
        relay?: string[];
        explorer?: string[];
      };
    }

    const tasks: any = new Listr<RestoreNetworkContext>(
      [
        this.buildInitializationTask(argv),
        // Flatten scan backup directory task (to load config and deployment state)
        this.buildScanBackupDirectoryTask(),
        {
          title: 'Initialize cluster configurations',
          task: (context_: any, taskListWrapper: any): any => {
            const initTasks: any[] = this.buildClusterInitializationTasks(context_, shard, realm);
            return taskListWrapper.newListr(initTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
        // Flatten the deployment tasks to top level (like default-one-shot.ts)
        ...this.buildDeploymentTasks(),
        {
          title: 'Enforce expected LoadBalancer IPs',
          skip: (): boolean => skipIpTracking || !expectedLbIpsFile,
          task: async (context_: RestoreNetworkContext, task): Promise<void> => {
            if (!context_.namespace) {
              throw new SoloError('Namespace is required to enforce expected LoadBalancer IPs.');
            }
            await this.enforceExpectedLoadBalancerIps(context_.namespace, expectedLbIpsFile);
            task.title = 'Enforce expected LoadBalancer IPs: completed';
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
    );

    try {
      await tasks.run();
      this.logger.showUser(chalk.green('\n✅ Network components deployed successfully!'));
      this.logger.showUser(chalk.cyan('\nℹ️  All network components have been deployed to existing clusters.'));
    } catch (error: any) {
      throw new SoloError(`Deploy network failed: ${error.message}`, error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error: any): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }
}
