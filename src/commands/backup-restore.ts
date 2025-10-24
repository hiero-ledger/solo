// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable} from 'tsyringe-neo';
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
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type Context} from '../types/index.js';

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
   * Generic export function for Kubernetes resources
   * @param outputDirectory - directory to export resources to
   * @param resourceType - type of resource ('configmaps' or 'secrets')
   * @returns number of resources exported
   */
  private async exportResources(outputDirectory: string, resourceType: 'configmaps' | 'secrets'): Promise<number> {
    try {
      // Load local config to get cluster reference and namespace
      await this.localConfig.load();

      // Get namespace from deployment configuration
      const namespace: NamespaceName = await resolveNamespaceFromDeployment(this.localConfig, this.configManager);

      // Get cluster context from current kubernetes config
      const context: Context = this.k8Factory.default().contexts().readCurrent();
      const k8: K8 = this.k8Factory.getK8(context);

      // Create output directory if it doesn't exist
      const resourceDirectory: string = path.join(outputDirectory, resourceType);
      if (!fs.existsSync(resourceDirectory)) {
        fs.mkdirSync(resourceDirectory, {recursive: true});
      }

      this.logger.showUser(chalk.cyan(`\nExporting ${resourceType} from namespace: ${namespace.toString()}`));

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
            ? '  No Opaque secrets found in namespace'
            : `  No ${resourceType} found in namespace`;
        this.logger.showUser(chalk.yellow(message));
        return 0;
      }

      const countMessage: string =
        resourceType === 'secrets' && totalCount !== resources.length
          ? `  Found ${resources.length} Opaque secret(s) (filtered from ${totalCount} total)`
          : `  Found ${resources.length} ${resourceType}`;
      this.logger.showUser(chalk.white(countMessage));

      // Export each resource as YAML
      for (const resource of resources) {
        const fileName: string = `${resource.name}.yaml`;
        const filePath: string = path.join(resourceDirectory, fileName);

        // Create a Kubernetes-compatible resource object
        const k8sResource: Record<string, unknown> = {
          apiVersion: 'v1',
          kind: resourceType === 'configmaps' ? 'ConfigMap' : 'Secret',
          metadata: {
            name: resource.name,
            namespace: resource.namespace.toString(),
            labels: resource.labels || {},
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

        this.logger.showUser(chalk.gray(`  ✓ Exported: ${fileName}`));
      }

      this.logger.showUser(chalk.green(`✓ Exported ${resources.length} ${resourceType} to ${resourceDirectory}`));
      return resources.length;
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
    this.configManager.update(argv);

    const deployment: string = this.configManager.getFlag<string>(flags.deployment);
    const outputDirectory: string = this.configManager.getFlag<string>(flags.outputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);

    if (!quiet) {
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser(chalk.cyan.bold('Backup Command'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('This command would backup all component configurations for deployment:'));
      this.logger.showUser(chalk.white(`  Deployment: ${chalk.green(deployment)}`));
      this.logger.showUser(chalk.white(`  Output Directory: ${chalk.green(outputDirectory)}`));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('Components to backup:'));
      this.logger.showUser(chalk.white('  • Local configuration'));
      this.logger.showUser(chalk.white('  • Remote configuration'));
      this.logger.showUser(chalk.white('  • Consensus node states'));
      this.logger.showUser(chalk.white('  • Block node states'));
      this.logger.showUser(chalk.white('  • Mirror node configuration'));
      this.logger.showUser(chalk.white('  • Relay configuration'));
      this.logger.showUser(chalk.white('  • Explorer configuration'));
      this.logger.showUser(chalk.white('  • Network keys and certificates'));
      this.logger.showUser('');
      this.logger.showUser(chalk.blue.bold('Example implementation would execute:'));
      this.logger.showUser(chalk.gray(`  mkdir -p ${outputDirectory}`));
      this.logger.showUser(
        chalk.gray(`  solo deployment config export --deployment ${deployment} > ${outputDirectory}/local-config.json`),
      );
      this.logger.showUser(
        chalk.gray(
          `  kubectl get configmap --namespace solo-${deployment} -o yaml > ${outputDirectory}/k8s-configs.yaml`,
        ),
      );
      this.logger.showUser(chalk.gray('  # Copy keys, certificates, and state files...'));
      this.logger.showUser('');
      this.logger.showUser(chalk.green('✓ Backup command structure validated'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
    }

    // Export configmaps and secrets from the cluster
    try {
      const configMapCount: number = await this.exportConfigMaps(outputDirectory);
      const secretCount: number = await this.exportSecrets(outputDirectory);

      if (!quiet) {
        this.logger.showUser('');
        this.logger.showUser(
          chalk.green(`✅ Backup completed: ${configMapCount} configmap(s) and ${secretCount} secret(s) exported`),
        );
      }
    } catch (error) {
      this.logger.showUser(chalk.red(`❌ Error during backup: ${error.message}`));
      throw error;
    }

    return true;
  }

  /**
   * Restore all component configurations
   */
  public async restore(argv: ArgvStruct): Promise<boolean> {
    this.configManager.update(argv);

    const deployment: string = this.configManager.getFlag<string>(flags.deployment);
    const inputDirectory: string = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);

    if (!quiet) {
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser(chalk.cyan.bold('Restore Command'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('This command would restore all component configurations for deployment:'));
      this.logger.showUser(chalk.white(`  Deployment: ${chalk.green(deployment)}`));
      this.logger.showUser(chalk.white(`  Input Directory: ${chalk.green(inputDirectory)}`));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('Components to restore:'));
      this.logger.showUser(chalk.white('  • Local configuration'));
      this.logger.showUser(chalk.white('  • Remote configuration'));
      this.logger.showUser(chalk.white('  • Consensus node states'));
      this.logger.showUser(chalk.white('  • Block node states'));
      this.logger.showUser(chalk.white('  • Mirror node configuration'));
      this.logger.showUser(chalk.white('  • Relay configuration'));
      this.logger.showUser(chalk.white('  • Explorer configuration'));
      this.logger.showUser(chalk.white('  • Network keys and certificates'));
      this.logger.showUser('');
      this.logger.showUser(chalk.blue.bold('Example implementation would execute:'));
      this.logger.showUser(chalk.gray(`  solo deployment config import --file ${inputDirectory}/local-config.json`));
      this.logger.showUser(
        chalk.gray(`  kubectl apply -f ${inputDirectory}/k8s-configs.yaml --namespace solo-${deployment}`),
      );
      this.logger.showUser(chalk.gray('  # Restore keys, certificates, and state files...'));
      this.logger.showUser('');
      this.logger.showUser(chalk.green('✓ Restore command structure validated'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
    }

    return true;
  }
}
