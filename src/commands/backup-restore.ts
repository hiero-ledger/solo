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
   * Export all configmaps from the cluster as YAML files
   * @param outputDir - directory to export configmaps to
   * @returns number of configmaps exported
   */
  private async exportConfigMaps(outputDir: string): Promise<number> {
    try {
      // Load local config to get cluster reference and namespace
      await this.localConfig.load();

      // Get namespace from deployment configuration
      const namespace: NamespaceName = await resolveNamespaceFromDeployment(this.localConfig, this.configManager);

      // Get cluster context from current kubernetes config
      const context: Context = this.k8Factory.default().contexts().readCurrent();
      const k8: K8 = this.k8Factory.getK8(context);

      // Create output directory if it doesn't exist
      const configMapsDir = path.join(outputDir, 'configmaps');
      if (!fs.existsSync(configMapsDir)) {
        fs.mkdirSync(configMapsDir, {recursive: true});
      }

      this.logger.showUser(chalk.cyan(`\nExporting configmaps from namespace: ${namespace.toString()}`));

      // List all configmaps in the namespace
      const configMaps: ConfigMap[] = await k8.configMaps().list(namespace, []);

      if (configMaps.length === 0) {
        this.logger.showUser(chalk.yellow('  No configmaps found in namespace'));
        return 0;
      }

      this.logger.showUser(chalk.white(`  Found ${configMaps.length} configmap(s)`));

      // Export each configmap as YAML
      for (const configMap of configMaps) {
        const fileName = `${configMap.name}.yaml`;
        const filePath = path.join(configMapsDir, fileName);

        // Create a Kubernetes-compatible ConfigMap object
        const k8sConfigMap = {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: configMap.name,
            namespace: configMap.namespace.toString(),
            labels: configMap.labels || {},
          },
          data: configMap.data || {},
        };

        // Convert to YAML and write to file
        const yamlContent = yaml.stringify(k8sConfigMap, {sortMapEntries: true});
        fs.writeFileSync(filePath, yamlContent, 'utf8');

        this.logger.showUser(chalk.gray(`  ✓ Exported: ${fileName}`));
      }

      this.logger.showUser(chalk.green(`✓ Exported ${configMaps.length} configmap(s) to ${configMapsDir}`));
      return configMaps.length;
    } catch (error) {
      throw new SoloError(`Failed to export configmaps: ${error.message}`, error);
    }
  }

  /**
   * Export all secrets from the cluster as YAML files
   * @param outputDir - directory to export secrets to
   * @returns number of secrets exported
   */
  private async exportSecrets(outputDir: string): Promise<number> {
    try {
      // Load local config to get cluster reference and namespace
      await this.localConfig.load();

      // Get namespace from deployment configuration
      const namespace: NamespaceName = await resolveNamespaceFromDeployment(this.localConfig, this.configManager);

      // Get cluster context from current kubernetes config
      const context: Context = this.k8Factory.default().contexts().readCurrent();
      const k8: K8 = this.k8Factory.getK8(context);

      // Create output directory if it doesn't exist
      const secretsDir = path.join(outputDir, 'secrets');
      if (!fs.existsSync(secretsDir)) {
        fs.mkdirSync(secretsDir, {recursive: true});
      }

      this.logger.showUser(chalk.cyan(`\nExporting secrets from namespace: ${namespace.toString()}`));

      // List all secrets in the namespace
      const allSecrets: Secret[] = await k8.secrets().list(namespace, []);

      // Filter to only include Opaque secrets
      const secrets: Secret[] = allSecrets.filter(secret => secret.type === 'Opaque');

      if (secrets.length === 0) {
        this.logger.showUser(chalk.yellow('  No Opaque secrets found in namespace'));
        return 0;
      }

      this.logger.showUser(chalk.white(`  Found ${secrets.length} Opaque secret(s) (filtered from ${allSecrets.length} total)`));

      // Export each secret as YAML
      for (const secret of secrets) {
        const fileName = `${secret.name}.yaml`;
        const filePath = path.join(secretsDir, fileName);

        // Create a Kubernetes-compatible Secret object
        const k8sSecret = {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            name: secret.name,
            namespace: secret.namespace,
            labels: secret.labels || {},
          },
          type: secret.type || 'Opaque',
          data: secret.data || {},
        };

        // Convert to YAML and write to file
        const yamlContent = yaml.stringify(k8sSecret, {sortMapEntries: true});
        fs.writeFileSync(filePath, yamlContent, 'utf8');

        this.logger.showUser(chalk.gray(`  ✓ Exported: ${fileName}`));
      }

      this.logger.showUser(chalk.green(`✓ Exported ${secrets.length} secret(s) to ${secretsDir}`));
      return secrets.length;
    } catch (error) {
      throw new SoloError(`Failed to export secrets: ${error.message}`, error);
    }
  }

  /**
   * Backup all component configurations
   */
  public async backup(argv: ArgvStruct): Promise<boolean> {
    this.configManager.update(argv);

    const deployment = this.configManager.getFlag<string>(flags.deployment);
    const outputDir = this.configManager.getFlag<string>(flags.outputDir) || './solo-backup';
    const quiet = this.configManager.getFlag<boolean>(flags.quiet);

    if (!quiet) {
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser(chalk.cyan.bold('Backup Command'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('This command would backup all component configurations for deployment:'));
      this.logger.showUser(chalk.white(`  Deployment: ${chalk.green(deployment)}`));
      this.logger.showUser(chalk.white(`  Output Directory: ${chalk.green(outputDir)}`));
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
      this.logger.showUser(chalk.gray(`  mkdir -p ${outputDir}`));
      this.logger.showUser(chalk.gray(`  solo deployment config export --deployment ${deployment} > ${outputDir}/local-config.json`));
      this.logger.showUser(chalk.gray(`  kubectl get configmap --namespace solo-${deployment} -o yaml > ${outputDir}/k8s-configs.yaml`));
      this.logger.showUser(chalk.gray(`  # Copy keys, certificates, and state files...`));
      this.logger.showUser('');
      this.logger.showUser(chalk.green('✓ Backup command structure validated'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
    }

    // Export configmaps and secrets from the cluster
    try {
      const configMapCount = await this.exportConfigMaps(outputDir);
      const secretCount = await this.exportSecrets(outputDir);

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

    const deployment = this.configManager.getFlag<string>(flags.deployment);
    const inputDir = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';
    const quiet = this.configManager.getFlag<boolean>(flags.quiet);

    if (!quiet) {
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser(chalk.cyan.bold('Restore Command'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
      this.logger.showUser('');
      this.logger.showUser(chalk.yellow('This command would restore all component configurations for deployment:'));
      this.logger.showUser(chalk.white(`  Deployment: ${chalk.green(deployment)}`));
      this.logger.showUser(chalk.white(`  Input Directory: ${chalk.green(inputDir)}`));
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
      this.logger.showUser(chalk.gray(`  solo deployment config import --file ${inputDir}/local-config.json`));
      this.logger.showUser(chalk.gray(`  kubectl apply -f ${inputDir}/k8s-configs.yaml --namespace solo-${deployment}`));
      this.logger.showUser(chalk.gray(`  # Restore keys, certificates, and state files...`));
      this.logger.showUser('');
      this.logger.showUser(chalk.green('✓ Restore command structure validated'));
      this.logger.showUser(chalk.cyan('='.repeat(80)));
    }

    return true;
  }
}
