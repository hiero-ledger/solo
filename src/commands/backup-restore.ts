// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable, container} from 'tsyringe-neo';
import {type ArgvStruct} from '../types/aliases.js';
import {type CommandFlags, type CommandFlag} from '../types/flag-types.js';
import chalk from 'chalk';
import yaml from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type K8} from '../integration/kube/k8.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {SoloError} from '../core/errors/solo-error.js';
import {type Context} from '../types/index.js';
import {Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import * as helpers from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {NodeCommandTasks} from './node/tasks.js';
import {load as yamlLoad} from 'js-yaml';
import {plainToInstance} from 'class-transformer';
import {RemoteConfigSchema} from '../data/schema/model/remote/remote-config-schema.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {type DeploymentStateSchema} from '../data/schema/model/remote/deployment-state-schema.js';
import {type ConsensusNodeStateSchema} from '../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {type ExplorerStateSchema} from '../data/schema/model/remote/state/explorer-state-schema.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {type DeploymentName, type SoloListr, type SoloListrTask} from '../types/index.js';
import {KeysCommandDefinition} from './command-definitions/keys-command-definition.js';
import {ConsensusCommandDefinition} from './command-definitions/consensus-command-definition.js';
import {BlockCommandDefinition} from './command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from './command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from './command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from './command-definitions/relay-command-definition.js';

@injectable()
export class BackupRestoreCommand extends BaseCommand {
  private readonly nodeCommandTasks: NodeCommandTasks;

  public constructor() {
    super();
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
    required: [flags.configFile],
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

      this.logger.showUser(
        chalk.cyan(
          `\nExporting ${resourceType} from namespace: ${namespace.toString()} across ${contexts.length} cluster(s)`,
        ),
      );

      let totalExportedCount: number = 0;

      // Iterate through each cluster context
      for (const context of contexts) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster context: ${context}`));

        const k8: K8 = this.k8Factory.getK8(context);

        // Create output directory for this context
        const contextDirectory: string = path.join(outputDirectory, context, resourceType);
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

    // Get namespace and contexts for backup operations
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const contexts: Context[] = this.remoteConfig.getContexts();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

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
            for (const context of contexts) {
              const logsDirectory: string = path.join(outputDirectory, context, 'logs');
              await networkNodes.getLogs(namespace, [context], logsDirectory);
            }
            task.title = `Download Node Logs: ${contexts.length} cluster(s) completed`;
          },
        },
        {
          title: 'Download Node State Files',
          task: async (context_, task) => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            for (const node of consensusNodes) {
              const nodeAlias: string = node.name;
              const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as any, consensusNodes);
              const statesDirectory: string = path.join(outputDirectory, context, 'states');
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

      this.logger.showUser(
        chalk.cyan(
          `\nImporting ${resourceType} to namespace: ${namespace.toString()} across ${contexts.length} cluster(s)`,
        ),
      );

      let totalImportedCount: number = 0;

      // Iterate through each cluster context
      for (const context of contexts) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster context: ${context}`));

        const k8: K8 = this.k8Factory.getK8(context);
        const contextDirectory: string = path.join(inputDirectory, context, resourceType);

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
    const contexts: Context[] = this.remoteConfig.getContexts();

    for (const context of contexts) {
      const logsDirectory: string = path.join(inputDirectory, context, 'logs');

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
        continue;
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
      const configData: any = yamlLoad(fileContent);

      if (!configData) {
        throw new SoloError('Config file is empty or invalid');
      }

      this.logger.showUser(chalk.green(`✓ Read config file successfully`));
      return configData;
    } catch (error: any) {
      throw new SoloError(
        `Failed to read config file ${configFilePath}: ${error.message}`,
        error,
      );
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
        actualConfigData = yamlLoad(remoteConfigYaml);
        this.logger.showUser(chalk.gray('  ✓ Extracted remote config from ConfigMap'));
      }
      
      // Transform to RemoteConfigSchema instance
      const remoteConfigSchema: RemoteConfigSchema = plainToInstance(
        RemoteConfigSchema,
        actualConfigData,
        {excludeExtraneousValues: true},
      );

      const remoteConfig: RemoteConfig = new RemoteConfig(remoteConfigSchema);
      this.logger.showUser(chalk.green('✓ Remote configuration parsed successfully'));
      
      return remoteConfig;
    } catch (error: any) {
      throw new SoloError(`Failed to parse remote config: ${error.message}`, error);
    }
  }

  /**
   * Display the deployment topology from DeploymentStateSchema
   */
  private displayDeploymentTopology(deploymentState: DeploymentStateSchema): void {
    this.logger.showUser(chalk.cyan('\n📊 Network Topology:'));
    this.logger.showUser(chalk.gray('  ────────────────────────────────────────'));

    // Consensus Nodes
    if (deploymentState.consensusNodes && deploymentState.consensusNodes.length > 0) {
      this.logger.showUser(chalk.yellow(`\n  Consensus Nodes: ${deploymentState.consensusNodes.length}`));
      for (const node of deploymentState.consensusNodes) {
        this.logger.showUser(chalk.gray(`    • ${node.metadata.id} - ${node.metadata.namespace}`));
      }
    }

    // Block Nodes
    if (deploymentState.blockNodes && deploymentState.blockNodes.length > 0) {
      this.logger.showUser(chalk.yellow(`\n  Block Nodes: ${deploymentState.blockNodes.length}`));
      for (const node of deploymentState.blockNodes) {
        this.logger.showUser(chalk.gray(`    • ${node.metadata.id}`));
      }
    }

    // Mirror Nodes
    if (deploymentState.mirrorNodes && deploymentState.mirrorNodes.length > 0) {
      this.logger.showUser(chalk.yellow(`\n  Mirror Nodes: ${deploymentState.mirrorNodes.length}`));
      for (const node of deploymentState.mirrorNodes) {
        this.logger.showUser(chalk.gray(`    • ${node.metadata.id}`));
      }
    }

    // Relay Nodes
    if (deploymentState.relayNodes && deploymentState.relayNodes.length > 0) {
      this.logger.showUser(chalk.yellow(`\n  Relay Nodes: ${deploymentState.relayNodes.length}`));
      for (const node of deploymentState.relayNodes) {
        this.logger.showUser(chalk.gray(`    • ${node.metadata.id}`));
      }
    }

    // Explorers
    if (deploymentState.explorers && deploymentState.explorers.length > 0) {
      this.logger.showUser(chalk.yellow(`\n  Explorers: ${deploymentState.explorers.length}`));
      for (const explorer of deploymentState.explorers) {
        this.logger.showUser(chalk.gray(`    • ${explorer.metadata.id}`));
      }
    }

    this.logger.showUser(chalk.gray('  ────────────────────────────────────────\n'));
  }

  /**
   * Deploy consensus network (generate keys + deploy network)
   * This should be called before block nodes are deployed
   */
  private deployConsensusNodesNetwork(
    consensusNodes: ConsensusNodeStateSchema[],
    deployment: DeploymentName,
  ): {nodeAliases: string; tasks: any[]} {
    // Build node-aliases from consensus nodes
    const nodeAliases = consensusNodes.map(n => `node${n.metadata.id}`).join(',');
    
    const tasks = [
      this.invokeSoloCommand(
        `solo ${KeysCommandDefinition.KEYS_COMMAND}`,
        KeysCommandDefinition.KEYS_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
            this.optionFromFlag(flags.generateGossipKeys),
            this.optionFromFlag(flags.generateTlsKeys),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.nodeAliasesUnparsed), nodeAliases,
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
        ConsensusCommandDefinition.DEPLOY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.persistentVolumeClaims),
            this.optionFromFlag(flags.nodeAliasesUnparsed), nodeAliases,
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
    ];
    
    return {nodeAliases, tasks};
  }

  /**
   * Setup and start consensus nodes
   * This should be called after block nodes are deployed
   */
  private deployConsensusNodesSetupAndStart(
    nodeAliases: string,
    deployment: DeploymentName,
  ): any[] {
    return [
      this.invokeSoloCommand(
        `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
        ConsensusCommandDefinition.SETUP_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
            this.optionFromFlag(flags.nodeAliasesUnparsed), nodeAliases,
            this.optionFromFlag(flags.deployment), deployment,
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${ConsensusCommandDefinition.START_COMMAND}`,
        ConsensusCommandDefinition.START_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ConsensusCommandDefinition.START_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.nodeAliasesUnparsed), nodeAliases,
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
    ];
  }

  /**
   * Deploy block nodes based on the deployment state
   */
  private deployBlockNodes(
    blockNodes: BlockNodeStateSchema[],
    deployment: DeploymentName,
    context: Context,
  ): any[] {
    // Create a task for each block node
    return blockNodes.map((blockNode, index) =>
      this.invokeSoloCommand(
        `solo ${BlockCommandDefinition.ADD_COMMAND} (node ${blockNode.metadata.id})`,
        BlockCommandDefinition.ADD_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...BlockCommandDefinition.ADD_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.clusterRef), context,
          );
          return this.argvPushGlobalFlags(argv);
        },
      )
    );
  }

  /**
   * Deploy mirror nodes based on the deployment state
   */
  private deployMirrorNodes(
    mirrorNodes: MirrorNodeStateSchema[],
    deployment: DeploymentName,
    context: Context,
  ): any[] {
    // Create a task for each mirror node
    return mirrorNodes.map((mirrorNode, index) =>
      this.invokeSoloCommand(
        `solo ${MirrorCommandDefinition.ADD_COMMAND} (node ${mirrorNode.metadata.id})`,
        MirrorCommandDefinition.ADD_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.clusterRef), context,
          );
          return this.argvPushGlobalFlags(argv);
        },
      )
    );
  }

  /**
   * Deploy explorer based on the deployment state
   */
  private deployExplorers(
    explorers: ExplorerStateSchema[],
    deployment: DeploymentName,
    context: Context,
  ): any[] {
    // Create a task for each explorer
    return explorers.map((explorer, index) =>
      this.invokeSoloCommand(
        `solo ${ExplorerCommandDefinition.ADD_COMMAND} (explorer ${explorer.metadata.id})`,
        ExplorerCommandDefinition.ADD_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.clusterRef), context,
          );
          return this.argvPushGlobalFlags(argv);
        },
      )
    );
  }

  /**
   * Deploy relay nodes based on the deployment state
   */
  private deployRelayNodes(
    relayNodes: RelayNodeStateSchema[],
    deployment: DeploymentName,
    nodeAliases: string,
  ): any[] {
    // Create a task for each relay node
    return relayNodes.map((relayNode, index) =>
      this.invokeSoloCommand(
        `solo ${RelayCommandDefinition.ADD_COMMAND} (node ${relayNode.metadata.id})`,
        RelayCommandDefinition.ADD_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...RelayCommandDefinition.ADD_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment), deployment,
            this.optionFromFlag(flags.nodeAliasesUnparsed), nodeAliases,
          );
          return this.argvPushGlobalFlags(argv);
        },
      )
    );
  }

  /**
   * Restore network components from a remote configuration file
   * Command: solo config ops restore-network
   */
  public async restoreNetwork(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface RestoreNetworkContext {
      configFilePath: string;
      remoteConfig?: RemoteConfig;
      deploymentState?: DeploymentStateSchema;
      namespace?: NamespaceName;
      deployment?: DeploymentName;
      context?: Context;
      nodeAliases?: string;
    }

    const tasks = new Listr<RestoreNetworkContext>(
      [
        {
          title: 'Initialize configuration',
          task: async context_ => {
            await self.localConfig.load();
            self.configManager.update(argv);

            context_.configFilePath = argv[flags.configFile.name] as string;
          },
        },
        {
          title: 'Read remote configuration from file',
          task: async context_ => {
            const configData = await self.readRemoteConfigFile(context_.configFilePath);
            context_.remoteConfig = self.parseRemoteConfig(configData);
            context_.deploymentState = context_.remoteConfig.state;
            
            // Extract deployment info from config (use first cluster)
            if (!context_.remoteConfig.clusters || context_.remoteConfig.clusters.length === 0) {
              throw new SoloError('No cluster information found in configuration file');
            }
            
            const clusterInfo = context_.remoteConfig.clusters[0];
            context_.namespace = NamespaceName.of(clusterInfo.namespace);
            context_.deployment = clusterInfo.deployment as DeploymentName;
            context_.context = clusterInfo.name; // Cluster name is the context
            
            self.logger.showUser(chalk.cyan(`\nDeployment: ${context_.deployment}`));
            self.logger.showUser(chalk.cyan(`Namespace: ${context_.namespace.name}`));
            self.logger.showUser(chalk.cyan(`Context: ${context_.context}`));
          },
        },
        {
          title: 'Display network topology',
          task: async context_ => {
            // Display topology
            self.displayDeploymentTopology(context_.deploymentState!);
          },
        },
        {
          title: 'Deploy network components',
          task: (context_, task): SoloListr<RestoreNetworkContext> => {
            const deploymentState: DeploymentStateSchema = context_.deploymentState!;
            const subtasks: SoloListrTask<RestoreNetworkContext>[] = [];

            // Step 1: Deploy consensus network (keys + network deploy)
            if (deploymentState.consensusNodes && deploymentState.consensusNodes.length > 0) {
              const result = self.deployConsensusNodesNetwork(
                deploymentState.consensusNodes,
                context_.deployment!,
              );
              context_.nodeAliases = result.nodeAliases;
              subtasks.push(...result.tasks);
            }

            // Step 2: Deploy block nodes (before consensus setup)
            if (deploymentState.blockNodes && deploymentState.blockNodes.length > 0) {
              const blockNodeTasks = self.deployBlockNodes(
                deploymentState.blockNodes,
                context_.deployment!,
                context_.context!,
              );
              subtasks.push(...blockNodeTasks);
            }

            // Step 3: Setup and start consensus nodes (after block nodes)
            if (deploymentState.consensusNodes && deploymentState.consensusNodes.length > 0) {
              const setupStartTasks = self.deployConsensusNodesSetupAndStart(
                context_.nodeAliases!,
                context_.deployment!,
              );
              subtasks.push(...setupStartTasks);
            }

            // Step 4: Deploy mirror nodes
            if (deploymentState.mirrorNodes && deploymentState.mirrorNodes.length > 0) {
              const mirrorNodeTasks = self.deployMirrorNodes(
                deploymentState.mirrorNodes,
                context_.deployment!,
                context_.context!,
              );
              subtasks.push(...mirrorNodeTasks);
            }

            // Step 5: Deploy relay nodes
            if (deploymentState.relayNodes && deploymentState.relayNodes.length > 0) {
              const relayNodeTasks = self.deployRelayNodes(
                deploymentState.relayNodes,
                context_.deployment!,
                context_.nodeAliases!,
              );
              subtasks.push(...relayNodeTasks);
            }

            // Step 6: Deploy explorers
            if (deploymentState.explorers && deploymentState.explorers.length > 0) {
              const explorerTasks = self.deployExplorers(
                deploymentState.explorers,
                context_.deployment!,
                context_.context!,
              );
              subtasks.push(...explorerTasks);
            }

            if (subtasks.length === 0) {
              throw new SoloError('No components found in deployment state to deploy');
            }

            return task.newListr(subtasks, {
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
      this.logger.showUser(chalk.green('\n✅ Network components restored successfully!'));
      this.logger.showUser(
        chalk.cyan(
          '\nℹ️  Network has been restored from configuration file. All components deployed.',
        ),
      );
    } catch (error: any) {
      throw new SoloError(`Restore network failed: ${error.message}`, error);
    }

    return true;
  }
}
