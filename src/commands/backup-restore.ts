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
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {SoloError} from '../core/errors/solo-error.js';
import {type Context} from '../types/index.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import * as helpers from '../core/helpers.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';

@injectable()
export class BackupRestoreCommand extends BaseCommand {
  public constructor() {
    super();
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
            const networkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            for (const context of contexts) {
              const logsDirectory = path.join(outputDirectory, context, 'logs');
              await networkNodes.getLogs(namespace, [context], logsDirectory);
            }
            task.title = `Download Node Logs: ${contexts.length} cluster(s) completed`;
          },
        },
        {
          title: 'Download Node State Files',
          task: async (context_, task) => {
            const networkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            for (const node of consensusNodes) {
              const nodeAlias = node.name;
              const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
              const statesDirectory = path.join(outputDirectory, context, 'states');
              await networkNodes.getStatesFromPod(namespace, nodeAlias, context, statesDirectory);
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
      const context_ = await tasks.run();

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
        const files = fs.readdirSync(contextDirectory).filter(file => file.endsWith('.yaml'));

        if (files.length === 0) {
          this.logger.showUser(chalk.yellow(`    No ${resourceType} YAML files found in this cluster`));
          continue;
        }

        this.logger.showUser(chalk.white(`    Found ${files.length} ${resourceType} file(s)`));

        // Import each resource from YAML
        for (const file of files) {
          const filePath: string = path.join(contextDirectory, file);
          const yamlContent: string = fs.readFileSync(filePath, 'utf8');
          const resource = yaml.parse(yamlContent);

          try {
            if (resourceType === 'configmaps') {
              await k8.configMaps().createOrReplace(
                namespace,
                resource.metadata.name,
                resource.metadata.labels || {},
                resource.data || {},
              );
            } else {
              await k8.secrets().createOrReplace(
                namespace,
                resource.metadata.name,
                resource.type || 'Opaque',
                resource.data || {},
                resource.metadata.labels || {},
              );
            }
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
          `\n✓ Total imported: ${totalImportedCount} ${resourceType} to ${contexts.length} cluster(s)`,
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
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const contexts: Context[] = this.remoteConfig.getContexts();

    for (const context of contexts) {
      const logsDirectory = path.join(inputDirectory, context, 'logs');

      // Check if logs directory exists
      if (!fs.existsSync(logsDirectory)) {
        this.logger.showUser(chalk.yellow(`  No logs directory found for context: ${context}`));
        continue;
      }

      // Get all log zip files directly from logs directory
      const allFiles = fs.readdirSync(logsDirectory);
      const logFiles = allFiles.filter(file => file.endsWith('.zip'));

      if (logFiles.length === 0) {
        this.logger.showUser(chalk.yellow(`  No log files found in context: ${context} (found ${allFiles.length} file(s))`));
        this.logger.showUser(chalk.gray(`    Available files: ${allFiles.join(', ')}`));
        continue;
      }

      this.logger.showUser(chalk.white(`  Restoring ${logFiles.length} log file(s) to context: ${context}`));

      // Get all pods in this context
      const k8 = this.k8Factory.getK8(context);
      const pods = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

      // Upload logs to each pod
      for (const logFile of logFiles) {
        // Extract pod name from log file (e.g., network-node-0.zip -> network-node-0)
        const podName = logFile.replace('.zip', '');
        const pod = pods.find(p => p.podReference.name.name === podName);

        if (!pod) {
          this.logger.showUser(chalk.yellow(`    No matching pod found for log file: ${logFile}`));
          continue;
        }

        const logFilePath = path.join(logsDirectory, logFile);
        const podReference = pod.podReference;
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const container = await k8.containers().readByRef(containerReference);

        // Upload log file to pod
        await container.copyTo(logFilePath, `${constants.HEDERA_HAPI_PATH}/data`);
        this.logger.showUser(chalk.green(`    ✓ Restored log for pod: ${podName}`));
      }
    }
  }

  /**
   * Restore state files to consensus nodes
   * @param inputDirectory - directory containing state files
   * @returns Promise that resolves when restoration is complete
   */
  private async restoreStateFiles(inputDirectory: string): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const contexts: Context[] = this.remoteConfig.getContexts();

    for (const node of consensusNodes) {
      const nodeAlias = node.name;
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      const statesDirectory = path.join(inputDirectory, context, 'states');

      // Look for state directory
      if (!fs.existsSync(statesDirectory)) {
        this.logger.showUser(chalk.yellow(`  No states directory found for context: ${context}`));
        continue;
      }

      // Get pod reference for this node first
      const k8 = this.k8Factory.getK8(context);
      const pods = await k8.pods().list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

      if (pods.length === 0) {
        this.logger.showUser(chalk.red(`  ✗ No pod found for node: ${nodeAlias}`));
        continue;
      }

      const pod = pods[0];
      const podReference = pod.podReference;
      const podName = podReference.name.name;

      // Look for state file by pod name (e.g., network-node-0-state.zip)
      const allStateFiles = fs.readdirSync(statesDirectory);
      const stateFiles = allStateFiles.filter(file => 
        file.startsWith(podName) && file.endsWith('-state.zip')
      );

      if (stateFiles.length === 0) {
        this.logger.showUser(chalk.yellow(`  No state file found for pod: ${podName} (node: ${nodeAlias})`));
        this.logger.showUser(chalk.gray(`    Looking for: ${podName}-state.zip`));
        this.logger.showUser(chalk.gray(`    Available files: ${allStateFiles.join(', ')}`));
        continue;
      }

      const stateFile = path.join(statesDirectory, stateFiles[0]);
      this.logger.showUser(chalk.white(`  Restoring state file for node ${nodeAlias} (pod: ${podName}): ${stateFiles[0]}`));

      const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
      const container = await k8.containers().readByRef(containerReference);

      // Upload state file to pod
      await container.copyTo(stateFile, `${constants.HEDERA_HAPI_PATH}/data`);

      // Delete previous state files
      await container.execContainer(['rm', '-rf', `${constants.HEDERA_HAPI_PATH}/data/saved/*`]);

      // Extract state file
      await container.execContainer([
        'tar',
        '-xzf',
        `${constants.HEDERA_HAPI_PATH}/data/${path.basename(stateFile)}`,
        '-C',
        `${constants.HEDERA_HAPI_PATH}/data/saved`,
      ]);

      this.logger.showUser(chalk.green(`  ✓ State file restored for node: ${nodeAlias}`));
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

    // Restore configmaps, secrets, and state files
    interface RestoreContext {
      configMapCount: number;
      secretCount: number;
    }

    const tasks = new Listr<RestoreContext>(
      [
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
        {
          title: 'Restore Node State Files',
          task: async (context_, task) => {
            await this.restoreStateFiles(inputDirectory);
            task.title = 'Restore Node State Files: completed';
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      const context_ = await tasks.run();

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
}
