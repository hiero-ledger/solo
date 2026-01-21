// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import chalk from 'chalk';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {Templates} from '../core/templates.js';
import {
  addDebugOptions,
  addRootImageValues,
  parseNodeAliases,
  resolveValidJsonFilePath,
  showVersionBanner,
  sleep,
} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import fs from 'node:fs';
import path from 'node:path';
import {type KeyManager} from '../core/key-manager.js';
import {type PlatformInstaller} from '../core/platform-installer.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type CertificateManager} from '../core/certificate-manager.js';
import {type AnyListrContext, type ArgvStruct, type IP, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {v4 as uuidv4} from 'uuid';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentId,
  type Context,
  type DeploymentName,
  type PrivateKeyAndCertificateObject,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Base64} from 'js-base64';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Duration} from '../core/time/duration.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type K8} from '../integration/kube/k8.js';
import {BlockNodesJsonWrapper} from '../core/block-nodes-json-wrapper.js';
import {type Lock} from '../core/lock/lock.js';
import {type LoadBalancerIngress} from '../integration/kube/resources/load-balancer-ingress.js';
import {type Service} from '../integration/kube/resources/service/service.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {lt as SemVersionLessThan, SemVer} from 'semver';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {ConsensusNode} from '../core/model/consensus-node.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {Version} from '../business/utils/version.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import * as versions from '../../version.js';
import {SoloLogger} from '../core/logging/solo-logger.js';
import {K8Factory} from '../integration/kube/k8-factory.js';
import {RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {K8Helper} from '../business/utils/k8-helper.js';

export interface NetworkDeployConfigClass {
  isUpgrade: boolean;
  applicationEnv: string;
  cacheDir: string;
  chartDirectory: string;
  loadBalancerEnabled: boolean;
  soloChartVersion: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  persistentVolumeClaims: string;
  profileFile: string;
  profileName: string;
  releaseTag: string;
  keysDir: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  stagingKeysDir: string;
  valuesFile: string;
  valuesArgMap: Record<ClusterReferenceName, string>;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  genesisThrottlesFile: string;
  resolvedThrottlesFile: string;
  haproxyIps: string;
  envoyIps: string;
  haproxyIpsParsed?: Record<NodeAlias, IP>;
  envoyIpsParsed?: Record<NodeAlias, IP>;
  storageType: constants.StorageType;
  gcsWriteAccessKey: string;
  gcsWriteSecrets: string;
  gcsEndpoint: string;
  gcsBucket: string;
  gcsBucketPrefix: string;
  awsWriteAccessKey: string;
  awsWriteSecrets: string;
  awsEndpoint: string;
  awsBucket: string;
  awsBucketPrefix: string;
  awsBucketRegion: string;
  backupBucket: string;
  backupWriteSecrets: string;
  backupWriteAccessKey: string;
  backupEndpoint: string;
  backupRegion: string;
  backupProvider: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  clusterRefs: ClusterReferences;
  domainNames?: string;
  domainNamesMapping?: Record<NodeAlias, string>;
  blockNodeComponents: BlockNodeStateSchema[];
  debugNodeAlias: NodeAlias;
  app: string;
  serviceMonitor: string;
  podLog: string;
  singleUseServiceMonitor: string;
  singleUsePodLog: string;
  enableMonitoringSupport: boolean;
  s6: boolean;
}

interface NetworkDeployContext {
  config: NetworkDeployConfigClass;
}

export interface NetworkDestroyContext {
  config: {
    deletePvcs: boolean;
    deleteSecrets: boolean;
    namespace: NamespaceName;
    enableTimeout: boolean;
    force: boolean;
    contexts: string[];
    deployment: string;
  };
  checkTimeout: boolean;
}

@injectable()
export class NetworkCommand extends BaseCommand {
  private profileValuesFile?: Record<ClusterReferenceName, string>;

  public constructor(
    @inject(InjectTokens.CertificateManager) private readonly certificateManager: CertificateManager,
    @inject(InjectTokens.KeyManager) private readonly keyManager: KeyManager,
    @inject(InjectTokens.PlatformInstaller) private readonly platformInstaller: PlatformInstaller,
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
  ) {
    super();

    this.certificateManager = patchInject(certificateManager, InjectTokens.CertificateManager, this.constructor.name);
    this.keyManager = patchInject(keyManager, InjectTokens.KeyManager, this.constructor.name);
    this.platformInstaller = patchInject(platformInstaller, InjectTokens.PlatformInstaller, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.deletePvcs, flags.deleteSecrets, flags.enableTimeout, flags.force, flags.quiet],
  };

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.genesisThrottlesFile,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.soloChartVersion,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.releaseTag,
      flags.settingTxt,
      flags.networkDeploymentValuesFile,
      flags.nodeAliasesUnparsed,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.storageType,
      flags.gcsWriteAccessKey,
      flags.gcsWriteSecrets,
      flags.gcsEndpoint,
      flags.gcsBucket,
      flags.gcsBucketPrefix,
      flags.awsWriteAccessKey,
      flags.awsWriteSecrets,
      flags.awsEndpoint,
      flags.awsBucket,
      flags.awsBucketRegion,
      flags.awsBucketPrefix,
      flags.backupBucket,
      flags.backupWriteAccessKey,
      flags.backupWriteSecrets,
      flags.backupEndpoint,
      flags.backupRegion,
      flags.backupProvider,
      flags.domainNames,
      flags.blockNodeCfg,
      flags.serviceMonitor,
      flags.podLog,
      flags.enableMonitoringSupport,
      flags.s6,
    ],
  };

  private waitForNetworkPods(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Check node pods are running',
      task: (context_, task): SoloListr<NetworkDeployContext> => {
        const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
        const config: NetworkDeployConfigClass = context_.config;

        for (const consensusNode of config.consensusNodes) {
          subTasks.push({
            title: `Check Node: ${chalk.yellow(consensusNode.name)}, Cluster: ${chalk.yellow(consensusNode.cluster)}`,
            task: async (): Promise<void> => {
              await this.k8Factory
                .getK8(consensusNode.context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                );
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
    };
  }

  private async prepareMinioSecrets(
    config: NetworkDeployConfigClass,
    minioAccessKey: string,
    minioSecretKey: string,
  ): Promise<void> {
    // Generating new minio credentials
    const minioData: Record<string, string> = {};
    const namespace: NamespaceName = config.namespace;
    const environmentString: string = `MINIO_ROOT_USER=${minioAccessKey}\nMINIO_ROOT_PASSWORD=${minioSecretKey}`;
    minioData['config.env'] = Base64.encode(environmentString);

    // create minio secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating minio secret using context: ${context}`);

      const isMinioSecretCreated: boolean = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.MINIO_SECRET_NAME, SecretType.OPAQUE, minioData);

      if (!isMinioSecretCreated) {
        throw new SoloError(`failed to create new minio secret using context: ${context}`);
      }

      this.logger.debug(`created minio secret using context: ${context}`);
    }
  }

  private async prepareStreamUploaderSecrets(config: NetworkDeployConfigClass): Promise<void> {
    const namespace: NamespaceName = config.namespace;

    // Generating cloud storage secrets
    const {gcsWriteAccessKey, gcsWriteSecrets, gcsEndpoint, awsWriteAccessKey, awsWriteSecrets, awsEndpoint} = config;
    const cloudData: Record<string, string> = {};
    if (
      config.storageType === constants.StorageType.AWS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      cloudData['S3_ACCESS_KEY'] = Base64.encode(awsWriteAccessKey);
      cloudData['S3_SECRET_KEY'] = Base64.encode(awsWriteSecrets);
      cloudData['S3_ENDPOINT'] = Base64.encode(awsEndpoint);
    }
    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      cloudData['GCS_ACCESS_KEY'] = Base64.encode(gcsWriteAccessKey);
      cloudData['GCS_SECRET_KEY'] = Base64.encode(gcsWriteSecrets);
      cloudData['GCS_ENDPOINT'] = Base64.encode(gcsEndpoint);
    }

    // create secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(
        `creating secret for storage credential of type '${config.storageType}' using context: ${context}`,
      );

      const isCloudSecretCreated: boolean = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.UPLOADER_SECRET_NAME, SecretType.OPAQUE, cloudData);

      if (!isCloudSecretCreated) {
        throw new SoloError(
          `failed to create secret for storage credentials of type '${config.storageType}' using context: ${context}`,
        );
      }

      this.logger.debug(
        `created secret for storage credential of type '${config.storageType}' using context: ${context}`,
      );
    }
  }

  private async prepareBackupUploaderSecrets(config: NetworkDeployConfigClass): Promise<void> {
    const {backupWriteAccessKey, backupWriteSecrets, backupEndpoint, backupRegion, backupProvider} = config;
    const backupData: Record<string, string> = {};
    const namespace: NamespaceName = config.namespace;
    backupData['AWS_ACCESS_KEY_ID'] = Base64.encode(backupWriteAccessKey);
    backupData['AWS_SECRET_ACCESS_KEY'] = Base64.encode(backupWriteSecrets);
    backupData['RCLONE_CONFIG_BACKUPS_ENDPOINT'] = Base64.encode(backupEndpoint);
    backupData['RCLONE_CONFIG_BACKUPS_REGION'] = Base64.encode(backupRegion);
    backupData['RCLONE_CONFIG_BACKUPS_TYPE'] = Base64.encode('s3');
    backupData['RCLONE_CONFIG_BACKUPS_PROVIDER'] = Base64.encode(backupProvider);

    // create secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating secret for backup uploader using context: ${context}`);

      const k8client: K8 = this.k8Factory.getK8(context);
      const isBackupSecretCreated: boolean = await k8client
        .secrets()
        .createOrReplace(namespace, constants.BACKUP_SECRET_NAME, SecretType.OPAQUE, backupData);

      if (!isBackupSecretCreated) {
        throw new SoloError(`failed to create secret for backup uploader using context: ${context}`);
      }

      this.logger.debug(`created secret for backup uploader using context: ${context}`);
    }
  }

  private async prepareStorageSecrets(config: NetworkDeployConfigClass): Promise<void> {
    try {
      if (config.storageType !== constants.StorageType.MINIO_ONLY) {
        const minioAccessKey: string = uuidv4();
        const minioSecretKey: string = uuidv4();
        await this.prepareMinioSecrets(config, minioAccessKey, minioSecretKey);
        await this.prepareStreamUploaderSecrets(config);
      }

      if (config.backupBucket) {
        await this.prepareBackupUploaderSecrets(config);
      }
    } catch (error) {
      throw new SoloError('Failed to create Kubernetes storage secret', error);
    }
  }

  /**
   * Prepare values args string for each cluster-ref
   * @param config
   */
  private async prepareValuesArgMap(config: NetworkDeployConfigClass): Promise<Record<ClusterReferenceName, string>> {
    const valuesArguments: Record<ClusterReferenceName, string> = this.prepareValuesArg(config);

    // prepare values files for each cluster
    const valuesArgumentMap: Record<ClusterReferenceName, string> = {};
    const profileName: string = this.configManager.getFlag(flags.profileName);
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    const applicationPropertiesPath: string = PathEx.joinWithRealPath(
      config.cacheDir,
      'templates',
      'application.properties',
    );

    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(
      profileName,
      config.consensusNodes,
      config.domainNamesMapping,
      deploymentName,
      applicationPropertiesPath,
    );

    const valuesFiles: Record<ClusterReferenceName, string> = BaseCommand.prepareValuesFilesMapMultipleCluster(
      config.clusterRefs,
      config.chartDirectory,
      this.profileValuesFile,
      config.valuesFile,
    );

    for (const clusterReference of Object.keys(valuesFiles)) {
      valuesArgumentMap[clusterReference] = valuesArguments[clusterReference] + valuesFiles[clusterReference];
      this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
        valuesArg: valuesArgumentMap,
      });
    }

    return valuesArgumentMap;
  }

  /**
   * Prepare the values argument for the helm chart for a given config
   * @param config
   */
  private prepareValuesArg(config: NetworkDeployConfigClass): Record<ClusterReferenceName, string> {
    const valuesArguments: Record<ClusterReferenceName, string> = {};
    const clusterReferences: ClusterReferenceName[] = [];
    let extraEnvironmentIndex: number = 0;

    // initialize the valueArgs
    for (const consensusNode of config.consensusNodes) {
      // add the cluster to the list of clusters
      if (!clusterReferences[consensusNode.cluster]) {
        clusterReferences.push(consensusNode.cluster);
      }

      // set the extraEnv settings on the nodes for running with a local build or tool
      if (config.app === constants.HEDERA_APP_NAME) {
        // make sure each cluster has an empty string for the valuesArg
        valuesArguments[consensusNode.cluster] = '';
      } else {
        extraEnvironmentIndex = 1; // used to add the debug options when using a tool or local build of hedera
        let valuesArgument: string = valuesArguments[consensusNode.cluster] ?? '';
        valuesArgument += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`;
        valuesArgument += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].value=com.swirlds.platform.Browser"`;
        valuesArguments[consensusNode.cluster] = valuesArgument;
      }
    }

    // add debug options to the debug node
    config.consensusNodes.filter((consensusNode): void => {
      if (consensusNode.name === config.debugNodeAlias) {
        valuesArguments[consensusNode.cluster] = addDebugOptions(
          valuesArguments[consensusNode.cluster],
          config.debugNodeAlias,
          extraEnvironmentIndex,
        );
      }
    });

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.GCS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.gcs.enabled=true';
      }
    }

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.AWS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.s3.enabled=true';
      }
    }

    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.AWS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.minio.enabled=false';
      }
    }

    if (config.storageType !== constants.StorageType.MINIO_ONLY) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.generateNewSecrets=false';
      }
    }

    if (config.gcsBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set cloud.buckets.streamBucket=${config.gcsBucket}` +
          ` --set minio-server.tenant.buckets[0].name=${config.gcsBucket}`;
      }
    }

    if (config.gcsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ` --set cloud.buckets.streamBucketPrefix=${config.gcsBucketPrefix}`;
      }
    }

    if (config.awsBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set cloud.buckets.streamBucket=${config.awsBucket}` +
          ` --set minio-server.tenant.buckets[0].name=${config.awsBucket}`;
      }
    }

    if (config.awsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ` --set cloud.buckets.streamBucketPrefix=${config.awsBucketPrefix}`;
      }
    }

    if (config.awsBucketRegion) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ` --set cloud.buckets.streamBucketRegion=${config.awsBucketRegion}`;
      }
    }

    if (config.backupBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ' --set defaults.sidecars.backupUploader.enabled=true' +
          ` --set defaults.sidecars.backupUploader.config.backupBucket=${config.backupBucket}`;
      }
    }

    if (this.configManager.getFlag(flags.s6)) {
      const nodeIndexByClusterAndName: Map<string, number> = new Map();
      const nextNodeIndexByCluster: Map<ClusterReferenceName, number> = new Map();
      for (const consensusNode of config.consensusNodes) {
        const nodeIndex: number = nextNodeIndexByCluster.get(consensusNode.cluster) ?? 0;
        nextNodeIndexByCluster.set(consensusNode.cluster, nodeIndex + 1);
        nodeIndexByClusterAndName.set(`${consensusNode.cluster}:${consensusNode.name}`, nodeIndex);
      }

      for (const consensusNode of config.consensusNodes) {
        const nodeIndex: number | undefined = nodeIndexByClusterAndName.get(
          `${consensusNode.cluster}:${consensusNode.name}`,
        );
        if (nodeIndex === undefined) {
          continue;
        }

        let valuesArgument: string = valuesArguments[consensusNode.cluster] ?? '';
        valuesArgument += ` --set "hedera.nodes[${nodeIndex}].name=${consensusNode.name}"`;
        valuesArgument = addRootImageValues(
          valuesArgument,
          `hedera.nodes[${nodeIndex}]`,
          constants.S6_NODE_IMAGE_REGISTRY,
          constants.S6_NODE_IMAGE_REPOSITORY,
          versions.S6_NODE_IMAGE_VERSION,
        );
        valuesArguments[consensusNode.cluster] = valuesArgument;
      }
    }

    for (const clusterReference of clusterReferences) {
      valuesArguments[clusterReference] +=
        ' --install' +
        ' --set "telemetry.prometheus.svcMonitor.enabled=false"' + // remove after chart version is bumped
        ` --set "crds.serviceMonitor.enabled=${config.singleUseServiceMonitor}"` +
        ` --set "crds.podLog.enabled=${config.singleUsePodLog}"` +
        ` --set "defaults.volumeClaims.enabled=${config.persistentVolumeClaims}"`;
    }

    config.singleUseServiceMonitor = 'false';
    config.singleUsePodLog = 'false';

    // Iterate over each node and set static IPs for HAProxy
    this.addArgForEachRecord(
      config.haproxyIpsParsed,
      config.consensusNodes,
      valuesArguments,
      ' --set "hedera.nodes[${nodeId}].haproxyStaticIP=${recordValue}"',
    );

    // Iterate over each node and set static IPs for Envoy Proxy
    this.addArgForEachRecord(
      config.envoyIpsParsed,
      config.consensusNodes,
      valuesArguments,
      ' --set "hedera.nodes[${nodeId}].envoyProxyStaticIP=${recordValue}"',
    );

    if (config.resolvedThrottlesFile) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set-file "hedera.configMaps.genesisThrottlesJson=${config.resolvedThrottlesFile}"`;
      }
    }

    if (config.loadBalancerEnabled) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ' --set "defaults.haproxy.service.type=LoadBalancer"' +
          ' --set "defaults.envoyProxy.service.type=LoadBalancer"' +
          ' --set "defaults.consensus.service.type=LoadBalancer"';
      }
    }

    if (config.enableMonitoringSupport) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set "crs.podLog.enabled=true" --set "crs.serviceMonitor.enabled=true"';
      }
    }

    return valuesArguments;
  }

  /**
   * Adds the template string to the argument for each record
   * @param records - the records to iterate over
   * @param consensusNodes - the consensus nodes to iterate over
   * @param valuesArguments - the values arguments to add to
   * @param templateString - the template string to add
   */
  private addArgForEachRecord(
    records: Record<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    valuesArguments: Record<ClusterReferenceName, string>,
    templateString: string,
  ): void {
    if (records) {
      for (const consensusNode of consensusNodes) {
        if (records[consensusNode.name]) {
          const newTemplateString: string = templateString.replace('{nodeId}', consensusNode.nodeId.toString());
          valuesArguments[consensusNode.cluster] += newTemplateString.replace(
            '{recordValue}',
            records[consensusNode.name],
          );
        }
      }
    }
  }

  private async prepareNamespaces(config: NetworkDeployConfigClass): Promise<void> {
    const namespace: NamespaceName = config.namespace;

    // check and create namespace in each cluster
    for (const context of config.contexts) {
      const k8client: K8 = this.k8Factory.getK8(context);
      if (await k8client.namespaces().has(namespace)) {
        this.logger.debug(`namespace '${namespace}' found using context: ${context}`);
      } else {
        this.logger.debug(`creating namespace '${namespace}' using context: ${context}`);
        await k8client.namespaces().create(namespace);
        this.logger.debug(`created namespace '${namespace}' using context: ${context}`);
      }
    }
  }

  private async prepareConfig(
    task: SoloListrTaskWrapper<NetworkDeployContext>,
    argv: ArgvStruct,
  ): Promise<NetworkDeployConfigClass> {
    const flagsWithDisabledPrompts: CommandFlag[] = [
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.genesisThrottlesFile,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.profileName,
      flags.profileFile,
      flags.settingTxt,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.storageType,
      flags.gcsWriteAccessKey,
      flags.gcsWriteSecrets,
      flags.gcsEndpoint,
      flags.gcsBucket,
      flags.gcsBucketPrefix,
      flags.nodeAliasesUnparsed,
      flags.domainNames,
    ];

    // disable the prompts that we don't want to prompt the user for
    flags.disablePrompts(flagsWithDisabledPrompts);

    const allFlags: CommandFlag[] = [
      ...NetworkCommand.DEPLOY_FLAGS_LIST.optional,
      ...NetworkCommand.DEPLOY_FLAGS_LIST.required,
    ];

    await this.configManager.executePrompt(task, allFlags);
    const namespace: NamespaceName =
      (await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task)) ??
      NamespaceName.of(this.configManager.getFlag(flags.deployment));

    this.configManager.setFlag(flags.namespace, namespace);

    // create a config object for subsequent steps
    const config: NetworkDeployConfigClass = this.configManager.getConfig(
      NetworkCommand.DEPLOY_CONFIGS_NAME,
      allFlags,
      [
        'keysDir',
        'nodeAliases',
        'stagingDir',
        'stagingKeysDir',
        'valuesArgMap',
        'resolvedThrottlesFile',
        'namespace',
        'consensusNodes',
        'contexts',
        'clusterRefs',
        'singleUsePodLog',
        'singleUseServiceMonitor',
      ],
    ) as NetworkDeployConfigClass;

    const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
    const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);

    const networkNodeVersion: SemVer = new SemVer(config.releaseTag);
    const minimumVersionForNonZeroRealms: SemVer = new SemVer('0.60.0');
    if ((realm !== 0 || shard !== 0) && SemVersionLessThan(networkNodeVersion, minimumVersionForNonZeroRealms)) {
      throw new SoloError(
        `The realm and shard values must be 0 when using the ${minimumVersionForNonZeroRealms} version of the network node`,
      );
    }

    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
    }

    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
    }

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
    config.stagingKeysDir = PathEx.join(config.stagingDir, 'keys');

    config.resolvedThrottlesFile = resolveValidJsonFilePath(
      config.genesisThrottlesFile,
      flags.genesisThrottlesFile.definition.defaultValue as string,
    );

    config.consensusNodes = this.remoteConfig.getConsensusNodes();
    config.contexts = this.remoteConfig.getContexts();
    config.clusterRefs = this.remoteConfig.getClusterRefs();
    config.nodeAliases = parseNodeAliases(config.nodeAliasesUnparsed, config.consensusNodes, this.configManager);
    argv[flags.nodeAliasesUnparsed.name] = config.nodeAliases.join(',');

    config.blockNodeComponents = this.getBlockNodes();

    config.singleUseServiceMonitor = config.serviceMonitor;
    config.singleUsePodLog = config.podLog;

    config.valuesArgMap = await this.prepareValuesArgMap(config);

    // need to prepare the namespaces before we can proceed
    config.namespace = namespace;
    await this.prepareNamespaces(config);

    // prepare staging keys directory
    if (!fs.existsSync(config.stagingKeysDir)) {
      fs.mkdirSync(config.stagingKeysDir, {recursive: true});
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir);
    }

    this.logger.debug('Preparing storage secrets');
    await this.prepareStorageSecrets(config);

    return config;
  }

  private async destroyTask(
    task: SoloListrTaskWrapper<NetworkDestroyContext>,
    namespace: NamespaceName,
    deletePvcs: boolean,
    deleteSecrets: boolean,
    contexts: Context[],
  ): Promise<void> {
    task.title = `Uninstalling chart ${constants.SOLO_DEPLOYMENT_CHART}`;

    // Uninstall all 'solo deployment' charts for each cluster using the contexts
    await Promise.all(
      contexts.map(async (context): Promise<void> => {
        await this.chartManager.uninstall(
          namespace,
          constants.SOLO_DEPLOYMENT_CHART,
          this.k8Factory.getK8(context).contexts().readCurrent(),
        );
      }),
    );

    task.title = `Deleting the RemoteConfig configmap in namespace ${namespace}`;
    await Promise.all(
      contexts.map(async (context): Promise<void> => {
        await this.k8Factory.getK8(context).configMaps().delete(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
      }),
    );

    if (deletePvcs) {
      task.title = `Deleting PVCs in namespace ${namespace}`;
      await this.deletePvcs(namespace, contexts);
    }

    if (deleteSecrets) {
      task.title = `Deleting Secrets in namespace ${namespace}`;
      await this.deleteSecrets(namespace, contexts);
    }

    if (deleteSecrets && deletePvcs) {
      await Promise.all(
        contexts.map(async (context): Promise<void> => {
          await this.k8Factory.getK8(context).namespaces().delete(namespace);
        }),
      );
    }
  }

  private async deleteSecrets(namespace: NamespaceName, contexts: Context[]): Promise<void> {
    const secretsData: Array<{secret: string; context: Context}> = [];

    for (const context of contexts) {
      const secrets: Secret[] = await this.k8Factory.getK8(context).secrets().list(namespace);

      for (const secret of secrets) {
        secretsData.push({secret: secret.name, context: context});
      }
    }

    const promises: Promise<void>[] = secretsData.map(async ({context, secret}): Promise<void> => {
      await this.k8Factory.getK8(context).secrets().delete(namespace, secret);
    });

    await Promise.all(promises);
  }

  private async deletePvcs(namespace: NamespaceName, contexts: Context[]): Promise<void> {
    const pvcsData: Array<{pvc: string; context: Context}> = [];

    for (const context of contexts) {
      const pvcs: string[] = await this.k8Factory.getK8(context).pvcs().list(namespace, []);

      for (const pvc of pvcs) {
        pvcsData.push({pvc, context});
      }
    }

    const promises: Promise<void>[] = pvcsData.map(async ({context, pvc}): Promise<void> => {
      await this.k8Factory
        .getK8(context)
        .pvcs()
        .delete(PvcReference.of(namespace, PvcName.of(pvc)))
        .catch();
    });

    await Promise.all(promises);
  }

  private async crdExists(context: string, crdName: string): Promise<boolean> {
    return await this.k8Factory.getK8(context).crds().ifExists(crdName);
  }

  /**
   * Ensure the PodLogs CRD from Grafana Alloy is installed
   */
  private async ensurePodLogsCrd({contexts}: NetworkDeployConfigClass): Promise<void> {
    const PODLOGS_CRD: string = 'podlogs.monitoring.grafana.com';
    const CRD_URL: string = `https://raw.githubusercontent.com/grafana/alloy/${versions.GRAFANA_PODLOGS_CRD_VERSION}/operations/helm/charts/alloy/charts/crds/crds/monitoring.grafana.com_podlogs.yaml`;

    for (const context of contexts as string[]) {
      const exists: boolean = await this.crdExists(context, PODLOGS_CRD);
      if (exists) {
        this.logger.debug(`CRD ${PODLOGS_CRD} already exists in context ${context}`);
        continue;
      }

      this.logger.info(`Installing missing CRD ${PODLOGS_CRD} from ${CRD_URL} in context ${context}...`);

      const temporaryFile: string = PathEx.join(path.sep, 'tmp', 'podlogs-crd.yaml');

      // download YAML from GitHub
      if (!fs.existsSync(temporaryFile)) {
        const response: Response = await fetch(CRD_URL);
        if (!response.ok) {
          throw new Error(`Failed to download CRD YAML: ${response.status} ${response.statusText}`);
        }

        const yamlContent: string = await response.text();
        fs.writeFileSync(temporaryFile, yamlContent, 'utf8');
      }

      await this.k8Factory.getK8(context).manifests().applyManifest(temporaryFile);
    }
  }

  /**
   * Ensure all Prometheus Operator CRDs exist; install chart only if needed.
   * If all CRDs are already present or monitoring support is disabled, skip installation.
   */
  /** Ensure Prometheus Operator CRDs are present; install missing ones via the chart */
  private async ensurePrometheusOperatorCrds({clusterRefs, namespace}: NetworkDeployConfigClass): Promise<void> {
    const CRDS: {key: string; crd: string}[] = [
      {key: 'alertmanagerconfigs', crd: 'alertmanagerconfigs.monitoring.coreos.com'},
      {key: 'alertmanagers', crd: 'alertmanagers.monitoring.coreos.com'},
      {key: 'podmonitors', crd: 'podmonitors.monitoring.coreos.com'},
      {key: 'probes', crd: 'probes.monitoring.coreos.com'},
      {key: 'prometheusagents', crd: 'prometheusagents.monitoring.coreos.com'},
      {key: 'prometheuses', crd: 'prometheuses.monitoring.coreos.com'},
      {key: 'prometheusrules', crd: 'prometheusrules.monitoring.coreos.com'},
      {key: 'scrapeconfigs', crd: 'scrapeconfigs.monitoring.coreos.com'},
      {key: 'servicemonitors', crd: 'servicemonitors.monitoring.coreos.com'},
      {key: 'thanosrulers', crd: 'thanosrulers.monitoring.coreos.com'},
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, context] of clusterRefs) {
      let valuesArgument: string = '';
      let missingCount: number = 0;

      for (const {key, crd} of CRDS) {
        const exists: boolean = await this.crdExists(context, crd);
        if (exists) {
          valuesArgument += ` --set "${key}.enabled=false"`;
        } else {
          missingCount++;
        }
      }

      if (missingCount === 0) {
        this.logger.info(`All Prometheus Operator CRDs already present in context ${context}; skipping installation.`);
        continue;
      }

      const setupMap: Map<string, string> = new Map([
        [constants.PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME, constants.PROMETHEUS_OPERATOR_CRDS_CHART_URL],
      ]);

      await this.chartManager.setup(setupMap);

      await this.chartManager.install(
        namespace,
        constants.PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        versions.PROMETHEUS_OPERATOR_CRDS_VERSION,
        valuesArgument,
        context,
      );

      showVersionBanner(
        this.logger,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        versions.PROMETHEUS_OPERATOR_CRDS_VERSION,
      );
    }
  }

  /** Run helm install and deploy network components */
  public async deploy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<NetworkDeployContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            this.configManager.update(argv);
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv, true, true);
            lease = await this.leaseManager.create();

            context_.config = await this.prepareConfig(task, argv);
            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Copy gRPC TLS Certificates',
          task: (context_, parentTask): SoloListr<AnyListrContext> =>
            this.certificateManager.buildCopyTlsCertificatesTasks(
              parentTask,
              context_.config.grpcTlsCertificatePath,
              context_.config.grpcWebTlsCertificatePath,
              context_.config.grpcTlsKeyPath,
              context_.config.grpcWebTlsKeyPath,
            ),
          skip: (context_): boolean =>
            !context_.config.grpcTlsCertificatePath && !context_.config.grpcWebTlsCertificatePath,
        },
        {
          title: 'Prepare staging directory',
          task: (_, parentTask): SoloListr<NetworkDeployContext> => {
            return parentTask.newListr(
              [
                {
                  title: 'Copy Gossip keys to staging',
                  task: (context_): void => {
                    const config: NetworkDeployConfigClass = context_.config;
                    this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeAliases);
                  },
                },
                {
                  title: 'Copy gRPC TLS keys to staging',
                  task: (context_): void => {
                    const config: NetworkDeployConfigClass = context_.config;
                    for (const nodeAlias of config.nodeAliases) {
                      const tlsKeyFiles: PrivateKeyAndCertificateObject = this.keyManager.prepareTlsKeyFilePaths(
                        nodeAlias,
                        config.keysDir,
                      );

                      this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
                    }
                  },
                },
              ],
              constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
            );
          },
        },
        {
          title: 'Copy node keys to secrets',
          task: (context_, parentTask): SoloListr<NetworkDeployContext> => {
            const config: NetworkDeployConfigClass = context_.config;

            // set up the subtasks
            return parentTask.newListr(
              this.platformInstaller.copyNodeKeys(config.stagingDir, config.consensusNodes, config.contexts),
              constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY,
            );
          },
        },
        {
          title: 'Install monitoring CRDs',
          skip: ({config: {enableMonitoringSupport}}): boolean => !enableMonitoringSupport,
          task: (_, task): SoloListr<NetworkDeployContext> => {
            const tasks: SoloListrTask<NetworkDeployContext>[] = [
              {
                title: 'Pod Logs CRDs',
                task: async ({config}): Promise<void> => await this.ensurePodLogsCrd(config),
              },
              {
                title: 'Prometheus Operator CRDs',
                task: async ({config}): Promise<void> => await this.ensurePrometheusOperatorCrds(config),
              },
            ];

            return task.newListr(tasks, {concurrent: false, rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION});
          },
        },
        {
          title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async (context_): Promise<void> => {
            const config: NetworkDeployConfigClass = context_.config;
            for (const [clusterReference] of config.clusterRefs) {
              const isInstalled: boolean = await this.chartManager.isChartInstalled(
                config.namespace,
                constants.SOLO_DEPLOYMENT_CHART,
                config.clusterRefs.get(clusterReference),
              );
              if (isInstalled) {
                await this.chartManager.uninstall(
                  config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  config.clusterRefs.get(clusterReference),
                );
                config.isUpgrade = true;
              }

              config.soloChartVersion = Version.getValidSemanticVersion(
                config.soloChartVersion,
                false,
                'Solo chart version',
              );

              await this.chartManager.upgrade(
                config.namespace,
                constants.SOLO_DEPLOYMENT_CHART,
                constants.SOLO_DEPLOYMENT_CHART,
                context_.config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
                config.soloChartVersion,
                config.valuesArgMap[clusterReference],
                config.clusterRefs.get(clusterReference),
              );
              showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion);
            }
          },
        },
        // TODO: Move the check for load balancer logic to a utility method or class
        {
          title: 'Check for load balancer',
          skip: ({config: {loadBalancerEnabled}}): boolean => loadBalancerEnabled === false,
          task: (context_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;

            //Add check for network node service to be created and load balancer to be assigned (if load balancer is enabled)
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Load balancer is assigned for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<void> => {
                  let attempts: number = 0;
                  let svc: Service[];

                  while (attempts < constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS) {
                    svc = await this.k8Factory
                      .getK8(consensusNode.context)
                      .services()
                      .list(config.namespace, [
                        `solo.hedera.com/node-id=${consensusNode.nodeId},solo.hedera.com/type=network-node-svc`,
                      ]);

                    if (svc && svc.length > 0 && svc[0].status?.loadBalancer?.ingress?.length > 0) {
                      let shouldContinue: boolean = false;
                      for (let index: number = 0; index < svc[0].status.loadBalancer.ingress.length; index++) {
                        const ingress: LoadBalancerIngress = svc[0].status.loadBalancer.ingress[index];
                        if (!ingress.hostname && !ingress.ip) {
                          shouldContinue = true; // try again if there is neither a hostname nor an ip
                          break;
                        }
                      }
                      if (shouldContinue) {
                        continue;
                      }
                      return;
                    }

                    attempts++;
                    await sleep(Duration.ofSeconds(constants.LOAD_BALANCER_CHECK_DELAY_SECS));
                  }
                  throw new SoloError('Load balancer not found');
                },
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        // TODO: find a better solution to avoid the need to redeploy the chart
        {
          title: 'Redeploy chart with external IP address config',
          skip: ({config: {loadBalancerEnabled}}): boolean => loadBalancerEnabled === false,
          task: async ({config}, task): Promise<SoloListr<NetworkDeployContext>> => {
            const {namespace, chartDirectory, soloChartVersion, clusterRefs} = config;

            // Update the valuesArgMap with the external IP addresses
            // This regenerates the config.txt and genesis-network.json files with the external IP addresses
            config.valuesArgMap = await this.prepareValuesArgMap(config);

            // Perform a helm upgrade for each cluster
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            for (const [clusterReference] of clusterRefs) {
              subTasks.push({
                title: `Upgrade chart for cluster: ${chalk.yellow(clusterReference)}`,
                task: async (): Promise<void> => {
                  await this.chartManager.upgrade(
                    namespace,
                    constants.SOLO_DEPLOYMENT_CHART,
                    constants.SOLO_DEPLOYMENT_CHART,
                    chartDirectory || constants.SOLO_TESTING_CHART_URL,
                    soloChartVersion,
                    config.valuesArgMap[clusterReference],
                    clusterRefs.get(clusterReference),
                  );
                  showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, soloChartVersion, 'Upgraded');

                  // TODO: Remove this code now that we have made the config dynamic and can update it without redeploying
                  const k8: K8 = this.k8Factory.getK8(clusterRefs.get(clusterReference));

                  const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

                  for (const pod of pods) {
                    await k8.pods().readByReference(pod.podReference).killPod();
                  }
                },
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        this.waitForNetworkPods(),
        {
          title: 'Check proxy pods are running',
          task: (context_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;

            // HAProxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<Pod[]> =>
                  await this.k8Factory
                    .getK8(consensusNode.context)
                    .pods()
                    .waitForRunningPhase(
                      config.namespace,
                      ['solo.hedera.com/type=haproxy'],
                      constants.PODS_RUNNING_MAX_ATTEMPTS,
                      constants.PODS_RUNNING_DELAY,
                    ),
              });
            }

            // Envoy Proxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check Envoy Proxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<Pod[]> =>
                  await this.k8Factory
                    .getK8(consensusNode.context)
                    .pods()
                    .waitForRunningPhase(
                      context_.config.namespace,
                      ['solo.hedera.com/type=envoy-proxy'],
                      constants.PODS_RUNNING_MAX_ATTEMPTS,
                      constants.PODS_RUNNING_DELAY,
                    ),
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Check auxiliary pods are ready',
          task: (_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [
              {
                title: 'Check MinIO',
                task: async ({config: {contexts, namespace}}): Promise<void> => {
                  for (const context of contexts) {
                    await this.k8Factory
                      .getK8(context)
                      .pods()
                      .waitForReadyStatus(
                        namespace,
                        ['v1.min.io/tenant=minio'],
                        constants.PODS_RUNNING_MAX_ATTEMPTS,
                        constants.PODS_RUNNING_DELAY,
                      );
                  }
                },
                // skip if only cloud storage is/are used
                skip: ({config: {storageType}}): boolean =>
                  storageType === constants.StorageType.GCS_ONLY ||
                  storageType === constants.StorageType.AWS_ONLY ||
                  storageType === constants.StorageType.AWS_AND_GCS,
              },
            ];

            // minio

            // set up the subtasks
            return task.newListr(subTasks, {
              concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        this.addNodesAndProxies(),
        {
          title: `Copy ${constants.BLOCK_NODES_JSON_FILE}`,
          skip: ({config: {blockNodeComponents}}): boolean => blockNodeComponents.length === 0,
          task: async ({config: {namespace, consensusNodes}}): Promise<void> => {
            try {
              for (const consensusNode of consensusNodes) {
                await NetworkCommand.createAndCopyBlockNodeJsonFileForConsensusNode(
                  consensusNode,
                  namespace,
                  this.logger,
                  this.k8Factory,
                  this.remoteConfig,
                );
              }
            } catch (error) {
              throw new SoloError(`Failed while creating block-nodes configuration: ${error.message}`, error);
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'consensus network deploy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, error);
      } finally {
        if (lease) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return true;
  }

  /**
   * @param consensusNode - the targeted consensus node
   * @param namespace
   * @param logger
   * @param k8Factory
   * @param remoteConfig
   */
  public static async createAndCopyBlockNodeJsonFileForConsensusNode(
    consensusNode: ConsensusNode,
    namespace: NamespaceName,
    logger: SoloLogger,
    k8Factory: K8Factory,
    remoteConfig: RemoteConfigRuntimeStateApi,
  ): Promise<void> {
    const {nodeId, context, name: nodeAlias, blockNodeMap} = consensusNode;

    const blockNodeIds: Set<ComponentId> = new Set(blockNodeMap.map(([id]): ComponentId => id));

    const blockNodeComponents: BlockNodeStateSchema[] = remoteConfig.configuration.state.blockNodes.filter(
      (blockNode): boolean => blockNodeIds.has(blockNode.metadata.id),
    );

    const blockNodesJsonData: string = new BlockNodesJsonWrapper(blockNodeMap, blockNodeComponents).toJSON();

    const blockNodesJsonFilename: string = `${constants.BLOCK_NODES_JSON_FILE.replace('.json', '')}-${nodeId}.json`;
    const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, blockNodesJsonFilename);

    fs.writeFileSync(blockNodesJsonPath, JSON.stringify(JSON.parse(blockNodesJsonData), undefined, 2));

    // Check if the file exists before copying
    if (!fs.existsSync(blockNodesJsonPath)) {
      logger.warn(`Block nodes JSON file not found: ${blockNodesJsonPath}`);
      return;
    }

    const k8: K8 = k8Factory.getK8(context);

    const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(namespace, nodeAlias);

    await container.execContainer('pwd');

    const targetDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

    await container.execContainer(`mkdir -p ${targetDirectory}`);

    // Copy the file and rename it to block-nodes.json in the destination
    await container.copyTo(blockNodesJsonPath, targetDirectory);

    // If using node-specific files, rename the copied file to the standard name
    const sourceFilename: string = path.basename(blockNodesJsonPath);
    await container.execContainer(
      `mv ${targetDirectory}/${sourceFilename} ${targetDirectory}/${constants.BLOCK_NODES_JSON_FILE}`,
    );

    const applicationPropertiesFilePath: string = `${constants.HEDERA_HAPI_PATH}/data/config/application.properties`;

    const applicationPropertiesData: string = await container.execContainer(`cat ${applicationPropertiesFilePath}`);

    const lines: string[] = applicationPropertiesData.split('\n');

    // Remove line to enable overriding below.
    for (const line of lines) {
      if (line === 'blockStream.streamMode=RECORDS') {
        lines.splice(lines.indexOf(line), 1);
      }
    }

    // Switch to block streaming.

    if (!lines.some((line): boolean => line.startsWith('blockStream.streamMode='))) {
      lines.push(`blockStream.streamMode=${constants.BLOCK_STREAM_STREAM_MODE}`);
    }

    if (!lines.some((line): boolean => line.startsWith('blockStream.writerMode='))) {
      lines.push(`blockStream.writerMode=${constants.BLOCK_STREAM_WRITER_MODE}`);
    }

    await k8.configMaps().update(namespace, 'network-node-data-config-cm', {
      ['applicationProperties']: lines.join('\n'),
      ['application.properties']: lines.join('\n'),
    });

    const configName: string = `network-${nodeAlias}-data-config-cm`;
    const configMapExists: boolean = await k8.configMaps().exists(namespace, configName);

    await (configMapExists
      ? k8.configMaps().update(namespace, configName, {'block-nodes.json': blockNodesJsonData})
      : k8.configMaps().create(namespace, configName, {}, {'block-nodes.json': blockNodesJsonData}));

    logger.debug(`Copied block-nodes configuration to consensus node ${consensusNode.name}`);

    const updatedApplicationPropertiesFilePath: string = PathEx.join(
      constants.SOLO_CACHE_DIR,
      'application.properties',
    );

    fs.writeFileSync(updatedApplicationPropertiesFilePath, lines.join('\n'));
    await container.copyTo(updatedApplicationPropertiesFilePath, targetDirectory);
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    let networkDestroySuccess: boolean = true;

    const tasks: SoloListr<NetworkDestroyContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<NetworkDeployContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the network components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);
            await this.configManager.executePrompt(task, [flags.deletePvcs, flags.deleteSecrets]);

            context_.config = {
              deletePvcs: this.configManager.getFlag(flags.deletePvcs),
              deleteSecrets: this.configManager.getFlag(flags.deleteSecrets),
              deployment: this.configManager.getFlag(flags.deployment),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              enableTimeout: this.configManager.getFlag(flags.enableTimeout),
              force: this.configManager.getFlag(flags.force),
              contexts: this.remoteConfig.getContexts(),
            };

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Running sub-tasks to destroy network',
          task: async (
            {config: {enableTimeout, deletePvcs, deleteSecrets, namespace, contexts}},
            task,
          ): Promise<void> => {
            if (!enableTimeout) {
              await this.destroyTask(task, namespace, deletePvcs, deleteSecrets, contexts);
              return;
            }

            const onTimeoutCallback: NodeJS.Timeout = setTimeout(async (): Promise<void> => {
              const message: string = `\n\nUnable to finish consensus network destroy in ${constants.NETWORK_DESTROY_WAIT_TIMEOUT} seconds\n\n`;
              this.logger.error(message);
              this.logger.showUser(chalk.red(message));
              networkDestroySuccess = false;

              if (!deleteSecrets || !deletePvcs) {
                await this.remoteConfig.deleteComponents();
                return;
              }

              for (const context of contexts) {
                await this.k8Factory.getK8(context).namespaces().delete(namespace);
              }
            }, constants.NETWORK_DESTROY_WAIT_TIMEOUT * 1000);

            await this.destroyTask(task, namespace, deletePvcs, deleteSecrets, contexts);

            clearTimeout(onTimeoutCallback);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'consensus network destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError('Error destroying network', error);
      } finally {
        // If the namespace is deleted, the lease can't be released
        await lease?.release().catch();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return networkDestroySuccess;
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public addNodesAndProxies(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const {namespace} = context_.config;

        for (const consensusNode of context_.config.consensusNodes) {
          const componentId: ComponentId = Templates.renderComponentIdFromNodeAlias(consensusNode.name);
          const clusterReference: ClusterReferenceName = consensusNode.cluster;

          this.remoteConfig.configuration.components.changeNodePhase(componentId, DeploymentPhase.REQUESTED);

          if (context_.config.isUpgrade) {
            this.logger.info('Do not add envoy and haproxy components again during upgrade');
          } else {
            // do not add new envoy or haproxy components if they already exist
            this.remoteConfig.configuration.components.addNewComponent(
              this.componentFactory.createNewEnvoyProxyComponent(clusterReference, namespace),
              ComponentTypes.EnvoyProxy,
            );

            this.remoteConfig.configuration.components.addNewComponent(
              this.componentFactory.createNewHaProxyComponent(clusterReference, namespace),
              ComponentTypes.HaProxy,
            );
          }
        }
        if (context_.config.releaseTag) {
          // update the solo chart version to match the deployed version
          this.remoteConfig.updateComponentVersion(
            ComponentTypes.ConsensusNode,
            new SemVer(context_.config.releaseTag),
          );
        }
        await this.remoteConfig.persist();
      },
    };
  }

  private getBlockNodes(): BlockNodeStateSchema[] {
    return this.remoteConfig.configuration.components.state.blockNodes;
  }

  public async close(): Promise<void> {} // no-op
}
