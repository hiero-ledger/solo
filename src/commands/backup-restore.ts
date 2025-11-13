// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable, container} from 'tsyringe-neo';
import {type ArgvStruct} from '../types/aliases.js';
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
import {type Context, type ClusterReferences} from '../types/index.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import * as helpers from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {NodeCommandTasks} from './node/tasks.js';
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

@injectable()
export class BackupRestoreCommand extends BaseCommand {
  private readonly nodeCommandTasks: NodeCommandTasks;

  public constructor(@inject(InjectTokens.KindBuilder) protected readonly kindBuilder: DefaultKindClientBuilder) {
    super();
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, BackupRestoreCommand.name);
    this.nodeCommandTasks = container.resolve(NodeCommandTasks);
  }

  public async close(): Promise<void> {
    // No resources to close for this command
  }

  public static BACKUP_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet, flags.outputDir],
  };

  public static RESTORE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet, flags.inputDir],
  };

  public static RESTORE_NETWORK_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet],
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
      const contexts: Context[] = this.remoteConfig.getContexts();
      const clusterRefs: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nExporting ${resourceType} from namespace: ${namespace.toString()} across ${contexts.length} cluster(s)`,
        ),
      );

      let totalExportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterRef, context] of clusterRefs.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterRef} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);

        // Create output directory using cluster reference (not context)
        const contextDirectory: string = path.join(outputDirectory, clusterRef, resourceType);
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
          resources = allSecrets.filter((secret): boolean => secret.type === 'Opaque');
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
          const filePath: string = path.join(contextDirectory, fileName);

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
          `\n✓ Total exported: ${totalExportedCount} ${resourceType} from ${contexts.length} cluster(s) to ${outputDirectory}/${resourceType}/`,
        ),
      );
      return totalExportedCount;
    } catch (error) {
      throw new SoloError(`Failed to export ${resourceType}: ${error.message}`, error);
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

    // Export configmaps and secrets from the cluster
    interface BackupContext {
      configMapCount: number;
      secretCount: number;
    }

    // Get namespace, contexts, and cluster references for backup operations
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const contexts: Context[] = this.remoteConfig.getContexts();
    const clusterRefs: ClusterReferences = this.remoteConfig.getClusterRefs();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    // Note: Network should be frozen before backup
    // Run: solo consensus network freeze --deployment <deployment-name>
    this.logger.showUser(
      chalk.yellow(
        '\n⚠️  Recommendation: Freeze the network before backup for data consistency.\n' +
          `   Run: solo consensus network freeze --deployment ${this.configManager.getFlag(flags.deployment)}\n`,
      ),
    );

    const tasks = new Listr<BackupContext>(
      [
        {
          title: 'Export ConfigMaps',
          task: async (context_, task) => {
            context_.configMapCount = await this.exportConfigMaps(outputDirectory);
            task.title = `Export ConfigMaps: ${context_.configMapCount} exported`;
          },
        },
        {
          title: 'Export Secrets',
          task: async (context_, task) => {
            context_.secretCount = await this.exportSecrets(outputDirectory);
            task.title = `Export Secrets: ${context_.secretCount} exported`;
          },
        },
        {
          title: 'Download Node Logs',
          task: async (context_, task) => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            for (const [clusterRef, context] of clusterRefs.entries()) {
              const logsDirectory: string = path.join(outputDirectory, clusterRef, 'logs');
              await networkNodes.getLogs(namespace, [context], logsDirectory);
            }
            task.title = `Download Node Logs: ${clusterRefs.size} cluster(s) completed`;
          },
        },
        {
          title: 'Download Node State Files',
          task: async (context_, task) => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            for (const node of consensusNodes) {
              const nodeAlias: string = node.name;
              const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as any, consensusNodes);
              const clusterRef: string = node.cluster; // Get cluster ref from node metadata
              const statesDirectory: string = path.join(outputDirectory, clusterRef, 'states');
              await networkNodes.getStatesFromPod(namespace, nodeAlias as any, context, statesDirectory);
            }
            task.title = `Download Node State Files: ${consensusNodes.length} node(s) completed`;
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
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
      const contexts: Context[] = this.remoteConfig.getContexts();
      const clusterRefs: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nImporting ${resourceType} to namespace: ${namespace.toString()} across ${contexts.length} cluster(s)`,
        ),
      );

      let totalImportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterRef, context] of clusterRefs.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterRef} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);
        const contextDirectory: string = path.join(inputDirectory, clusterRef, resourceType);

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
          const filePath: string = path.join(contextDirectory, file);
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
        chalk.green(`\n✓ Total imported: ${totalImportedCount} ${resourceType} to ${contexts.length} cluster(s)`),
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
    const clusterRefs: ClusterReferences = this.remoteConfig.getClusterRefs();

    for (const [clusterRef, context] of clusterRefs.entries()) {
      const logsDirectory: string = path.join(inputDirectory, clusterRef, 'logs', namespace.toString());

      // Check if logs directory exists
      if (!fs.existsSync(logsDirectory)) {
        this.logger.showUser(chalk.yellow(`  No logs directory found for context: ${context}`));
        continue;
      }

      // Get all log zip files directly from logs directory
      const allFiles: string[] = fs.readdirSync(logsDirectory);
      const logFiles: string[] = allFiles.filter(file => file.endsWith('.zip'));

      if (logFiles.length === 0) {
        this.logger.showUser(
          chalk.yellow(`  No log files found in context: ${context} (found ${allFiles.length} file(s))`),
        );
        this.logger.showUser(chalk.gray(`    Available files: ${allFiles.join(', ')}`));
        throw new SoloError(`No log files found to restore in context: ${context}`);
      }

      this.logger.showUser(chalk.white(`  Restoring ${logFiles.length} log file(s) to context: ${context}`));

      // Get all pods in this context
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: any[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

      // Upload logs to each pod
      for (const logFile of logFiles) {
        // Extract pod name from log file (e.g., network-node-0.zip -> network-node-0)
        const podName: string = logFile.replace('.zip', '');
        const pod: any = pods.find((p: any): boolean => p.podReference.name.name === podName);

        if (!pod) {
          this.logger.showUser(chalk.yellow(`    No matching pod found for log file: ${logFile}`));
          continue;
        }

        const logFilePath: string = path.join(logsDirectory, logFile);
        const podReference: any = pod.podReference;
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const container: any = await k8.containers().readByRef(containerReference);

        // Upload log file to pod
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
        await container.execContainer(['bash', '-c', `sudo chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}`]);

        this.logger.showUser(chalk.green(`    ✓ Restored log for pod: ${podName}`));
      }
    }
  }

  /**
   * Restore all component configurations
   */
  public async restore(argv: ArgvStruct): Promise<boolean> {
    // Load configurations
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv);

    this.configManager.update(argv);

    const inputDirectory: string = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);

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

    const tasks = new Listr<RestoreContext>(
      [
        {
          title: 'Initialize restore configuration',
          task: async (context_, task) => {
            // Build pod references map
            const podReferences: any = {};

            for (const nodeAlias of nodeAliases) {
              const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as any, consensusNodes);
              const k8: K8 = this.k8Factory.getK8(context);
              const pods: any[] = await k8
                .pods()
                .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

              if (pods.length > 0) {
                podReferences[nodeAlias] = pods[0].podReference;
              }
            }

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
          task: async (context_, task) => {
            try {
              // Use the existing freeze command to freeze the network
              await invokeSoloCommand(
                'Freeze network',
                'consensus network freeze',
                (): string[] => {
                  const argv: string[] = CommandHelpers.newArgv();
                  argv.push('consensus', 'network', 'freeze');
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
          task: async (context_, task) => {
            context_.configMapCount = await this.importConfigMaps(inputDirectory);
            task.title = `Import ConfigMaps: ${context_.configMapCount} imported`;
          },
        },
        {
          title: 'Import Secrets',
          task: async (context_, task) => {
            context_.secretCount = await this.importSecrets(inputDirectory);
            task.title = `Import Secrets: ${context_.secretCount} imported`;
          },
        },
        {
          title: 'Restore Logs and Configs',
          task: async (context_, task) => {
            await this.restoreLogsAndConfigs(inputDirectory);
            task.title = 'Restore Logs and Configs: completed';
          },
        },
        this.nodeCommandTasks.uploadStateFiles(false, inputDirectory),
        {
          title: 'Start consensus nodes',
          task: async (context_, taskListWrapper) => {
            return taskListWrapper.newListr(
              [
                this.nodeCommandTasks.startNodes('nodeAliases'),
                this.nodeCommandTasks.checkAllNodesAreActive('nodeAliases'),
              ],
              {
                concurrent: false,
                rendererOptions: {collapseSubtasks: false},
              },
            );
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
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
      let actualConfigData = configData;

      // Check if this is a ConfigMap wrapper (has apiVersion, kind, data)
      if (configData.kind === 'ConfigMap' && configData.data) {
        this.logger.showUser(chalk.gray('  Detected ConfigMap format, extracting remote config data...'));

        // Extract the remote config from the ConfigMap data field
        const remoteConfigKey = 'remote-config-data';
        const remoteConfigYaml = configData.data[remoteConfigKey];

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

  /**
   * Build deployment tasks at the top level (not nested) to avoid Listr hanging issues
   * This follows the pattern from default-one-shot.ts
   */
  private buildDeploymentTasks(): any[] {
    const self = this;
    const tasks: any[] = [];

    return [
      ...tasks,
      // Keys generation task
      {
        title: 'Generate consensus node keys',
        skip: (context_: any) =>
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
            self.taskList,
          );
        },
      },
      // Consensus network deploy task
      {
        title: 'Deploy consensus network',
        skip: (context_: any) =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.DEPLOY_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment,
                CommandHelpers.optionFromFlag(flags.persistentVolumeClaims),
              );

              // Enable load balancer if multiple clusters are detected
              if (context_.clusters && context_.clusters.length > 1) {
                argv.push(CommandHelpers.optionFromFlag(flags.loadBalancerEnabled));
                self.logger.info(`Multiple clusters detected (${context_.clusters.length}), enabling load balancer`);
              }

              if (context_.versions?.consensusNode) {
                argv.push(CommandHelpers.optionFromFlag(flags.releaseTag), context_.versions.consensusNode.toString());
              }
              if (context_.versions?.chart) {
                argv.push(CommandHelpers.optionFromFlag(flags.soloChartVersion), context_.versions.chart.toString());
              }
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            self.taskList,
          );
        },
      },
      // Block nodes deploy tasks (one per block node)
      ...self.buildBlockNodeTasks(),
      // Consensus node setup task
      {
        title: 'Setup consensus nodes',
        skip: (context_: any) =>
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
            self.taskList,
          );
        },
      },
      // Consensus node start task
      {
        title: 'Start consensus nodes',
        skip: (context_: any) =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.START_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.START_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment,
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases,
              );
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            self.taskList,
          );
        },
      },
      // Mirror nodes deploy tasks
      ...self.buildMirrorNodeTasks(),
      // Relay nodes deploy tasks
      ...self.buildRelayNodeTasks(),
      // Explorer nodes deploy tasks
      ...self.buildExplorerTasks(),
    ];
  }

  /**
   * Build block node deployment tasks
   */
  private buildBlockNodeTasks(): any[] {
    const self = this;
    const tasks: any[] = [];

    return [
      {
        title: 'Deploy block nodes',
        skip: (context_: any) =>
          !context_.deploymentState?.blockNodes || context_.deploymentState.blockNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          const blockNodeTasks: any[] = [];

          for (const blockNode of context_.deploymentState.blockNodes) {
            blockNodeTasks.push({
              title: `Deploy block node ${blockNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this block node
                const nodeCluster = blockNode.metadata.cluster;
                if (nodeCluster) {
                  self.logger.info(`Switching to cluster '${nodeCluster}' for block node ${blockNode.metadata.id}`);
                  const k8 = self.k8Factory.getK8(nodeCluster);
                  k8.contexts().updateCurrent(nodeCluster);
                }

                return subTaskSoloCommand(
                  BlockCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();
                    argv.push(
                      ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                      CommandHelpers.optionFromFlag(flags.deployment),
                      context_.deployment,
                      optionFromFlag(flags.clusterRef),
                      nodeCluster || context_.context,
                    );
                    if (context_.versions?.blockNodeChart) {
                      argv.push(
                        optionFromFlag(flags.blockNodeChartVersion),
                        context_.versions.blockNodeChart.toString(),
                      );
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  self.taskList,
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
  private buildMirrorNodeTasks(): any[] {
    const self = this;

    return [
      {
        title: 'Deploy mirror nodes',
        skip: (context_: any) =>
          !context_.deploymentState?.mirrorNodes || context_.deploymentState.mirrorNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          const mirrorNodeTasks: any[] = [];

          for (const mirrorNode of context_.deploymentState.mirrorNodes) {
            mirrorNodeTasks.push({
              title: `Deploy mirror node ${mirrorNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this mirror node
                const nodeCluster = mirrorNode.metadata.cluster;
                if (nodeCluster) {
                  self.logger.info(`Switching to cluster '${nodeCluster}' for mirror node ${mirrorNode.metadata.id}`);
                  const k8 = self.k8Factory.getK8(nodeCluster);
                  k8.contexts().updateCurrent(nodeCluster);
                }

                return subTaskSoloCommand(
                  MirrorCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();
                    argv.push(
                      ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
                      CommandHelpers.optionFromFlag(flags.deployment),
                      context_.deployment,
                      optionFromFlag(flags.clusterRef),
                      nodeCluster || context_.context,
                    );
                    if (context_.versions?.mirrorNodeChart) {
                      argv.push(optionFromFlag(flags.mirrorNodeVersion), context_.versions.mirrorNodeChart.toString());
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  self.taskList,
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
  private buildRelayNodeTasks(): any[] {
    const self = this;

    return [
      {
        title: 'Deploy relay nodes',
        skip: (context_: any) =>
          !context_.deploymentState?.relayNodes || context_.deploymentState.relayNodes.length === 0,
        task: async (context_, taskListWrapper) => {
          const relayNodeTasks: any[] = [];

          for (const relayNode of context_.deploymentState.relayNodes) {
            relayNodeTasks.push({
              title: `Deploy relay node ${relayNode.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this relay node
                const nodeCluster = relayNode.metadata.cluster;
                if (nodeCluster) {
                  self.logger.info(`Switching to cluster '${nodeCluster}' for relay node ${relayNode.metadata.id}`);
                  const k8 = self.k8Factory.getK8(nodeCluster);
                  k8.contexts().updateCurrent(nodeCluster);
                }

                return subTaskSoloCommand(
                  RelayCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();
                    argv.push(
                      ...RelayCommandDefinition.ADD_COMMAND.split(' '),
                      CommandHelpers.optionFromFlag(flags.deployment),
                      context_.deployment,
                      CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                      context_.nodeAliases,
                    );
                    // Add cluster ref if node has cluster metadata
                    if (nodeCluster) {
                      argv.push(optionFromFlag(flags.clusterRef), nodeCluster);
                    }
                    if (context_.versions?.jsonRpcRelayChart) {
                      argv.push(optionFromFlag(flags.relayReleaseTag), context_.versions.jsonRpcRelayChart.toString());
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  self.taskList,
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
  private buildExplorerTasks(): any[] {
    const self = this;

    return [
      {
        title: 'Deploy explorers',
        skip: (context_: any) =>
          !context_.deploymentState?.explorers || context_.deploymentState.explorers.length === 0,
        task: async (context_, taskListWrapper) => {
          const explorerTasks: any[] = [];

          for (const explorer of context_.deploymentState.explorers) {
            explorerTasks.push({
              title: `Deploy explorer ${explorer.metadata.id}`,
              task: async (_, subTaskListWrapper) => {
                // Switch to the correct cluster context for this explorer
                const nodeCluster = explorer.metadata.cluster;
                if (nodeCluster) {
                  self.logger.info(`Switching to cluster '${nodeCluster}' for explorer ${explorer.metadata.id}`);
                  const k8 = self.k8Factory.getK8(nodeCluster);
                  k8.contexts().updateCurrent(nodeCluster);
                }

                return subTaskSoloCommand(
                  ExplorerCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();
                    argv.push(
                      ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                      CommandHelpers.optionFromFlag(flags.deployment),
                      context_.deployment,
                      optionFromFlag(flags.clusterRef),
                      nodeCluster || context_.context,
                    );
                    if (context_.versions?.explorerChart) {
                      argv.push(optionFromFlag(flags.explorerVersion), context_.versions.explorerChart.toString());
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  self.taskList,
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
   * Restore network components from a remote configuration file
   * Command: solo config ops restore-network
   */
  public async restoreNetwork(argv: ArgvStruct): Promise<boolean> {
    const self = this;

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
    }

    const tasks = new Listr<RestoreNetworkContext>(
      [
        {
          title: 'Initialize configuration',
          task: async context_ => {
            await self.localConfig.load();
            self.configManager.update(argv);

            const inputDir = argv[flags.inputDir.name] as string;
            if (!inputDir) {
              throw new SoloError('Input directory is required. Use --input-dir flag.');
            }
            context_.inputDirectory = inputDir;
          },
        },
        {
          title: 'Scan backup directory structure',
          task: async context_ => {
            const inputDir = context_.inputDirectory;
            
            // Verify input directory exists
            if (!fs.existsSync(inputDir)) {
              throw new SoloError(`Input directory does not exist: ${inputDir}`);
            }

            // Read subdirectories (cluster reference names - these should NOT have "kind-" prefix)
            const entries = fs.readdirSync(inputDir, {withFileTypes: true});
            const clusterRefDirs = entries
              .filter(entry => entry.isDirectory())
              .map(entry => entry.name);

            if (clusterRefDirs.length === 0) {
              throw new SoloError(`No cluster directories found in: ${inputDir}`);
            }

            // Store cluster reference directory names for mapping to kubectl contexts later
            context_.contextDirs = clusterRefDirs;

            self.logger.showUser(chalk.cyan(`\nFound ${clusterRefDirs.length} cluster(s): ${clusterRefDirs.join(', ')}`));

            // Read solo-remote-config.yaml from the first cluster's configmaps directory
            const firstClusterRef = clusterRefDirs[0];
            const configPath = path.join(inputDir, firstClusterRef, 'configmaps', 'solo-remote-config.yaml');
            
            if (!fs.existsSync(configPath)) {
              throw new SoloError(
                `solo-remote-config.yaml not found at: ${configPath}. Expected structure: <input-dir>/<cluster-ref>/configmaps/solo-remote-config.yaml`,
              );
            }

            self.logger.showUser(chalk.cyan(`Reading configuration from: ${configPath}`));

            // Read and parse the config file
            const configData = await self.readRemoteConfigFile(configPath);
            context_.remoteConfig = self.parseRemoteConfig(configData);
            context_.deploymentState = context_.remoteConfig.state;
            context_.versions = context_.remoteConfig.versions;
            
            // Use clusters from config file (they contain cluster reference names, not kubectl context names)
            // The cluster reference names should NOT have "kind-" prefix
            if (!context_.remoteConfig.clusters || context_.remoteConfig.clusters.length === 0) {
              throw new SoloError('No cluster information found in configuration file');
            }
            
            context_.clusters = context_.remoteConfig.clusters;
            
            // Log cluster information from config
            const clusterNames = context_.clusters.map(c => c.name).join(', ');
            self.logger.showUser(chalk.cyan(`Clusters from config: ${clusterNames}`));
            
            // Validate: number of cluster directories should match number of clusters in config
            if (clusterRefDirs.length !== context_.clusters.length) {
              self.logger.showUser(
                chalk.yellow(
                  `Warning: Found ${clusterRefDirs.length} cluster directory(ies) but config has ${context_.clusters.length} cluster(s)`,
                ),
              );
            }

            // Extract deployment info from config (use first cluster)
            const clusterInfo = context_.remoteConfig.clusters[0];
            context_.namespace = NamespaceName.of(clusterInfo.namespace);
            context_.deployment = clusterInfo.deployment as DeploymentName;
            context_.context = clusterInfo.name; // Cluster name is the context

            self.logger.showUser(chalk.cyan(`\nDeployment: ${context_.deployment}`));
            self.logger.showUser(chalk.cyan(`Namespace: ${context_.namespace.name}`));
            self.logger.showUser(chalk.cyan(`Context: ${context_.context}`));

            // Build node aliases and validate we have components to deploy
            if (context_.deploymentState!.consensusNodes && context_.deploymentState!.consensusNodes.length > 0) {
              context_.nodeAliases = context_
                .deploymentState!.consensusNodes.map(n => `node${n.metadata.id}`)
                .join(',');
              context_.numConsensusNodes = context_.deploymentState!.consensusNodes.length;
            }

            const hasComponents =
              (context_.deploymentState!.consensusNodes?.length || 0) > 0 ||
              (context_.deploymentState!.blockNodes?.length || 0) > 0 ||
              (context_.deploymentState!.mirrorNodes?.length || 0) > 0 ||
              (context_.deploymentState!.relayNodes?.length || 0) > 0 ||
              (context_.deploymentState!.explorers?.length || 0) > 0;

            if (!hasComponents) {
              throw new SoloError('No components found in deployment state to deploy');
            }
          },
        },
        {
          title: 'Delete existing clusters',
          task: async (context_, task) => {
            for (const cluster of context_.clusters) {
              const kindExecutable: string = await self.depManager.getExecutablePath(constants.KIND);
              const kindClient: KindClient = await self.kindBuilder.executable(kindExecutable).build();
              await kindClient.deleteCluster(cluster.name);
            }
            task.title = 'Deleted existing clusters: completed';
          },
        },
        {
          title: 'Create Kind clusters',
          task: async (context_, taskListWrapper) => {
            if (!context_.clusters || context_.clusters.length === 0) {
              throw new SoloError('No cluster information found in configuration');
            }

            // Create Docker network for multi-cluster setup
            if (context_.clusters.length > 1) {
              self.logger.info(
                `Multiple clusters detected (${context_.clusters.length}), creating Kind Docker network...`,
              );
              try {
                const shellRunner = new ShellRunner(self.logger);
                await shellRunner.run(
                  'docker network rm -f kind || true && docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge',
                );

                // Add MetalLB Helm repository for multi-cluster load balancing
                self.logger.info('Adding MetalLB Helm repository...');
                await shellRunner.run('helm repo add metallb https://metallb.github.io/metallb');
                await shellRunner.run('helm repo update');
              } catch (error: any) {
                // Network might already exist, which is fine
                if (error.message && error.message.includes('already exists')) {
                  self.logger.info('Kind Docker network already exists, continuing...');
                } else {
                  throw new SoloError(
                    `Failed to create Kind Docker network or add MetalLB repo: ${error.message}`,
                    error,
                  );
                }
              }
            }

            const clusterTasks: any[] = [];
            const isMultiCluster = context_.clusters.length > 1;

            // Create a task for each cluster
            for (let clusterIndex = 0; clusterIndex < context_.clusters.length; clusterIndex++) {
              const cluster = context_.clusters[clusterIndex];
              
              // Get the cluster reference from directory name (should NOT have "kind-" prefix)
              // This is used as the base name for Kind cluster creation
              // Kind will automatically add "kind-" prefix when creating the cluster
              const clusterRefFromDir = context_.contextDirs![clusterIndex];
              const clusterNameForCreation = clusterRefFromDir; // Use as-is for Kind

              clusterTasks.push({
                title: `Creating cluster '${clusterNameForCreation}' (cluster ref: ${cluster.name})`,
                task: async (_, task) => {
                  const kindExecutable: string = await self.depManager.getExecutablePath(constants.KIND);
                  const kindClient: KindClient = await self.kindBuilder.executable(kindExecutable).build();
                  const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(clusterNameForCreation);
                  task.title = `Created cluster '${clusterResponse.name}' with context '${clusterResponse.context}'`;

                  // Wait for cluster control plane to be ready by checking API server
                  self.logger.info(`Waiting for cluster '${clusterResponse.context}' control plane to be ready...`);
                  const maxAttempts = 60; // 60 attempts * 2 seconds = 120 seconds max
                  let attempt = 0;
                  let clusterReady = false;

                  while (attempt < maxAttempts && !clusterReady) {
                    try {
                      const k8 = self.k8Factory.getK8(clusterResponse.context);
                      // Try to list namespaces as a simple API readiness check
                      await k8.namespaces().list();
                      clusterReady = true;
                      self.logger.info(
                        `Cluster '${clusterResponse.context}' is ready after ${(attempt + 1) * 2} seconds`,
                      );
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
                  self.logger.info(`Setting current context to '${clusterResponse.context}'`);
                  const k8 = self.k8Factory.getK8(clusterResponse.context);
                  k8.contexts().updateCurrent(clusterResponse.context);

                  // Install MetalLB for multi-cluster setups
                  if (isMultiCluster) {
                    self.logger.info(`Installing MetalLB on cluster '${clusterResponse.context}'...`);
                    const shellRunner = new ShellRunner(self.logger);

                    // Install MetalLB using Helm
                    await shellRunner.run(
                      'helm upgrade --install metallb metallb/metallb ' +
                        '--namespace metallb-system --create-namespace --atomic --wait ' +
                        '--set speaker.frr.enabled=true',
                    );

                    // Apply cluster-specific MetalLB configuration
                    const metallbConfigPath = `test/e2e/dual-cluster/metallb-cluster-${clusterIndex + 1}.yaml`;
                    self.logger.info(`Applying MetalLB config from '${metallbConfigPath}'...`);
                    await shellRunner.run(`kubectl apply -f "${metallbConfigPath}"`);

                    task.title = `Created cluster '${clusterResponse.name}' with MetalLB`;
                  }
                },
              });
            }

            return taskListWrapper.newListr(clusterTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
        {
          title: 'Initialize cluster configurations',
          task: async (context_, taskListWrapper) => {
            const initTasks: any[] = [];
            const createdDeployments: Set<string> = new Set(); // Track deployments already created

            // For each cluster, run the initialization commands
            for (const cluster of context_.clusters!) {
              const clusterReference = cluster.name;
              const contextName = `kind-${cluster.name}`; // kubectl context with prefix: "kind-e2e-cluster-alpha"
              const namespace = cluster.namespace;
              const deployment = cluster.deployment;

              // Count consensus nodes belonging to this specific cluster
              // Note: nodes may have cluster saved with or without prefix, so check both
              const clusterConsensusNodeCount = context_.deploymentState!.consensusNodes.filter(
                node => node.metadata.cluster === clusterReference,
              ).length;

              self.logger.info(
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
                  self.taskList,
                ),
                // IMPORTANT: Connect BEFORE Setup so the mapping exists when setup looks it up
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
                  self.taskList,
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
                  self.taskList,
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
                      );
                      return argv;
                    },
                    self.taskList,
                  ),
                );
                createdDeployments.add(deployment);
              }

              initTasks.push(
                invokeSoloCommand(
                  `Attach cluster '${clusterReference}' to deployment '${deployment}' with ${clusterConsensusNodeCount} consensus nodes`,
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
                  self.taskList,
                ),
              );
            }

            return taskListWrapper.newListr(initTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
        // Flatten the deployment tasks to top level (like default-one-shot.ts)
        ...self.buildDeploymentTasks(),
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
      this.logger.showUser(chalk.green('\n✅ Network components restored successfully!'));
      this.logger.showUser(
        chalk.cyan('\nℹ️  Network has been restored from configuration file. All components deployed.'),
      );
    } catch (error: any) {
      throw new SoloError(`Restore network failed: ${error.message}`, error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }
}
