// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import chalk from 'chalk';
import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {Templates} from '../core/templates.js';
import {
  addDebugOptions,
  resolveValidJsonFilePath,
  sleep,
  parseNodeAliases,
  prepareChartPath,
  showVersionBanner,
} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import fs from 'fs';
import {type KeyManager} from '../core/key-manager.js';
import {type PlatformInstaller} from '../core/platform-installer.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type CertificateManager} from '../core/certificate-manager.js';
import {type AnyYargs, type IP, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {ConsensusNodeComponent} from '../core/config/remote/components/consensus-node-component.js';
import {ConsensusNodeStates} from '../core/config/remote/enumerations.js';
import {EnvoyProxyComponent} from '../core/config/remote/components/envoy-proxy-component.js';
import {HaProxyComponent} from '../core/config/remote/components/ha-proxy-component.js';
import {v4 as uuidv4} from 'uuid';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../types/index.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {PvcRef} from '../integration/kube/resources/pvc/pvc-ref.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {type ClusterRef, type ClusterRefs} from '../core/config/remote/types.js';
import {Base64} from 'js-base64';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Duration} from '../core/time/duration.js';
import {type PodRef} from '../integration/kube/resources/pod/pod-ref.js';
import {SOLO_DEPLOYMENT_CHART} from '../core/constants.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';

export interface NetworkDeployConfigClass {
  applicationEnv: string;
  cacheDir: string;
  chartDirectory: string;
  enablePrometheusSvcMonitor: boolean;
  loadBalancerEnabled: boolean;
  soloChartVersion: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  persistentVolumeClaims: string;
  profileFile: string;
  profileName: string;
  releaseTag: string;
  chartPath: string;
  keysDir: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  stagingKeysDir: string;
  valuesFile: string;
  valuesArgMap: Record<ClusterRef, string>;
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
  backupBucket: string;
  googleCredential: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  clusterRefs: ClusterRefs;
  domainNames?: string;
  domainNamesMapping?: Record<NodeAlias, string>;
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
  private profileValuesFile?: Record<ClusterRef, string>;

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

  private static readonly DEPLOY_CONFIGS_NAME = 'deployConfigs';

  private static readonly DESTROY_FLAGS_LIST = {
    required: [],
    optional: [flags.deletePvcs, flags.deleteSecrets, flags.enableTimeout, flags.force, flags.deployment, flags.quiet],
  };

  private static readonly DEPLOY_FLAGS_LIST = {
    required: [],
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
      flags.enablePrometheusSvcMonitor,
      flags.soloChartVersion,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.deployment,
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
      flags.awsBucketPrefix,
      flags.backupBucket,
      flags.googleCredential,
      flags.domainNames,
    ],
  };

  public static readonly COMMAND_NAME = 'network';

  private waitForNetworkPods() {
    const self = this;
    return {
      title: 'Check node pods are running',
      task: (ctx, task) => {
        const subTasks: any[] = [];
        const config = ctx.config;

        // nodes
        for (const consensusNode of config.consensusNodes) {
          subTasks.push({
            title: `Check Node: ${chalk.yellow(consensusNode.name)}, Cluster: ${chalk.yellow(consensusNode.cluster)}`,
            task: async () =>
              await self.k8Factory
                .getK8(consensusNode.context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                ),
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

  async prepareMinioSecrets(config: NetworkDeployConfigClass, minioAccessKey: string, minioSecretKey: string) {
    // Generating new minio credentials
    const minioData = {};
    const namespace = config.namespace;
    const envString = `MINIO_ROOT_USER=${minioAccessKey}\nMINIO_ROOT_PASSWORD=${minioSecretKey}`;
    minioData['config.env'] = Base64.encode(envString);

    // create minio secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating minio secret using context: ${context}`);

      const isMinioSecretCreated = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.MINIO_SECRET_NAME, SecretType.OPAQUE, minioData, undefined);

      if (!isMinioSecretCreated) {
        throw new SoloError(`failed to create new minio secret using context: ${context}`);
      }

      this.logger.debug(`created minio secret using context: ${context}`);
    }
  }

  async prepareStreamUploaderSecrets(config: NetworkDeployConfigClass) {
    const namespace = config.namespace;

    // Generating cloud storage secrets
    const {gcsWriteAccessKey, gcsWriteSecrets, gcsEndpoint, awsWriteAccessKey, awsWriteSecrets, awsEndpoint} = config;
    const cloudData = {};
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

      const isCloudSecretCreated = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.UPLOADER_SECRET_NAME, SecretType.OPAQUE, cloudData, undefined);

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

  async prepareBackupUploaderSecrets(config: NetworkDeployConfigClass) {
    if (config.googleCredential) {
      const backupData = {};
      const namespace = config.namespace;
      const googleCredential = fs.readFileSync(config.googleCredential, 'utf8');
      backupData['saJson'] = Base64.encode(googleCredential);

      // create secret in each cluster
      for (const context of config.contexts) {
        this.logger.debug(`creating secret for backup uploader using context: ${context}`);

        const k8client = this.k8Factory.getK8(context);
        const isBackupSecretCreated = await k8client
          .secrets()
          .createOrReplace(namespace, constants.BACKUP_SECRET_NAME, SecretType.OPAQUE, backupData, undefined);

        if (!isBackupSecretCreated) {
          throw new SoloError(`failed to create secret for backup uploader using context: ${context}`);
        }

        this.logger.debug(`created secret for backup uploader using context: ${context}`);
      }
    }
  }

  async prepareStorageSecrets(config: NetworkDeployConfigClass) {
    try {
      if (config.storageType !== constants.StorageType.MINIO_ONLY) {
        const minioAccessKey = uuidv4();
        const minioSecretKey = uuidv4();
        await this.prepareMinioSecrets(config, minioAccessKey, minioSecretKey);
        await this.prepareStreamUploaderSecrets(config);
      }

      await this.prepareBackupUploaderSecrets(config);
    } catch (e: Error | any) {
      throw new SoloError('Failed to create Kubernetes storage secret', e);
    }
  }

  /**
   * Prepare values args string for each cluster-ref
   * @param config
   */
  async prepareValuesArgMap(config: {
    chartDirectory?: string;
    app?: string;
    nodeAliases: string[];
    debugNodeAlias?: NodeAlias;
    enablePrometheusSvcMonitor?: boolean;
    releaseTag?: string;
    persistentVolumeClaims?: string;
    valuesFile?: string;
    haproxyIpsParsed?: Record<NodeAlias, IP>;
    envoyIpsParsed?: Record<NodeAlias, IP>;
    storageType: constants.StorageType;
    resolvedThrottlesFile: string;
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
    backupBucket: string;
    googleCredential: string;
    loadBalancerEnabled: boolean;
    clusterRefs: ClusterRefs;
    consensusNodes: ConsensusNode[];
    domainNamesMapping?: Record<NodeAlias, string>;
  }): Promise<Record<ClusterRef, string>> {
    const valuesArgs: Record<ClusterRef, string> = this.prepareValuesArg(config);

    // prepare values files for each cluster
    const valuesArgMap: Record<ClusterRef, string> = {};
    const profileName = this.configManager.getFlag(flags.profileName);

    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(
      profileName,
      config.consensusNodes,
      config.domainNamesMapping,
    );

    const valuesFiles: Record<ClusterRef, string> = BaseCommand.prepareValuesFilesMapMulticluster(
      config.clusterRefs,
      config.chartDirectory,
      this.profileValuesFile,
      config.valuesFile,
    );

    for (const clusterRef of Object.keys(valuesFiles)) {
      valuesArgMap[clusterRef] = valuesArgs[clusterRef] + valuesFiles[clusterRef];
      this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterRef}`, {valuesArg: valuesArgMap});
    }

    return valuesArgMap;
  }

  /**
   * Prepare the values argument for the helm chart for a given config
   * @param config
   */
  prepareValuesArg(config: {
    chartDirectory?: string;
    app?: string;
    consensusNodes: ConsensusNode[];
    debugNodeAlias?: NodeAlias;
    enablePrometheusSvcMonitor?: boolean;
    releaseTag?: string;
    persistentVolumeClaims?: string;
    valuesFile?: string;
    haproxyIpsParsed?: Record<NodeAlias, IP>;
    envoyIpsParsed?: Record<NodeAlias, IP>;
    storageType: constants.StorageType;
    resolvedThrottlesFile: string;
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
    backupBucket: string;
    googleCredential: string;
    loadBalancerEnabled: boolean;
    domainNamesMapping?: Record<NodeAlias, string>;
  }): Record<ClusterRef, string> {
    const valuesArgs: Record<ClusterRef, string> = {};
    const clusterRefs: ClusterRef[] = [];
    let extraEnvIndex = 0;

    // initialize the valueArgs
    for (const consensusNode of config.consensusNodes) {
      // add the cluster to the list of clusters
      if (!clusterRefs[consensusNode.cluster]) clusterRefs.push(consensusNode.cluster);

      // set the extraEnv settings on the nodes for running with a local build or tool
      if (config.app !== constants.HEDERA_APP_NAME) {
        extraEnvIndex = 1; // used to add the debug options when using a tool or local build of hedera
        let valuesArg: string = valuesArgs[consensusNode.cluster] ?? '';
        valuesArg += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`;
        valuesArg += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].value=com.swirlds.platform.Browser"`;
        valuesArgs[consensusNode.cluster] = valuesArg;
      } else {
        // make sure each cluster has an empty string for the valuesArg
        valuesArgs[consensusNode.cluster] = '';
      }
    }

    // add debug options to the debug node
    config.consensusNodes.filter(consensusNode => {
      if (consensusNode.name === config.debugNodeAlias) {
        valuesArgs[consensusNode.cluster] = addDebugOptions(
          valuesArgs[consensusNode.cluster],
          config.debugNodeAlias,
          extraEnvIndex,
        );
      }
    });

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.GCS_ONLY
    ) {
      clusterRefs.forEach(clusterRef => (valuesArgs[clusterRef] += ' --set cloud.gcs.enabled=true'));
    }

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.AWS_ONLY
    ) {
      clusterRefs.forEach(clusterRef => (valuesArgs[clusterRef] += ' --set cloud.s3.enabled=true'));
    }

    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.AWS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      clusterRefs.forEach(clusterRef => (valuesArgs[clusterRef] += ' --set cloud.minio.enabled=false'));
    }

    if (config.storageType !== constants.StorageType.MINIO_ONLY) {
      clusterRefs.forEach(clusterRef => (valuesArgs[clusterRef] += ' --set cloud.generateNewSecrets=false'));
    }

    if (config.gcsBucket) {
      clusterRefs.forEach(
        clusterRef =>
          (valuesArgs[clusterRef] +=
            ` --set cloud.buckets.streamBucket=${config.gcsBucket}` +
            ` --set minio-server.tenant.buckets[0].name=${config.gcsBucket}`),
      );
    }

    if (config.gcsBucketPrefix) {
      clusterRefs.forEach(
        clusterRef => (valuesArgs[clusterRef] += ` --set cloud.buckets.streamBucketPrefix=${config.gcsBucketPrefix}`),
      );
    }

    if (config.awsBucket) {
      clusterRefs.forEach(
        clusterRef =>
          (valuesArgs[clusterRef] +=
            ` --set cloud.buckets.streamBucket=${config.awsBucket}` +
            ` --set minio-server.tenant.buckets[0].name=${config.awsBucket}`),
      );
    }

    if (config.awsBucketPrefix) {
      clusterRefs.forEach(
        clusterRef => (valuesArgs[clusterRef] += ` --set cloud.buckets.streamBucketPrefix=${config.awsBucketPrefix}`),
      );
    }

    if (config.backupBucket) {
      clusterRefs.forEach(
        clusterRef =>
          (valuesArgs[clusterRef] +=
            ' --set defaults.sidecars.backupUploader.enabled=true' +
            ` --set defaults.sidecars.backupUploader.config.backupBucket=${config.backupBucket}`),
      );
    }

    clusterRefs.forEach(
      clusterRef =>
        (valuesArgs[clusterRef] +=
          ` --set "telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}"` +
          ` --set "defaults.volumeClaims.enabled=${config.persistentVolumeClaims}"`),
    );

    // Iterate over each node and set static IPs for HAProxy
    this.addArgForEachRecord(
      config.haproxyIpsParsed,
      config.consensusNodes,
      valuesArgs,
      ' --set "hedera.nodes[${nodeId}].haproxyStaticIP=${recordValue}"',
    );

    // Iterate over each node and set static IPs for Envoy Proxy
    this.addArgForEachRecord(
      config.envoyIpsParsed,
      config.consensusNodes,
      valuesArgs,
      ' --set "hedera.nodes[${nodeId}].envoyProxyStaticIP=${recordValue}"',
    );

    if (config.resolvedThrottlesFile) {
      clusterRefs.forEach(
        clusterRef =>
          (valuesArgs[clusterRef] +=
            ` --set-file "hedera.configMaps.genesisThrottlesJson=${config.resolvedThrottlesFile}"`),
      );
    }

    if (config.loadBalancerEnabled) {
      clusterRefs.forEach(
        clusterRef =>
          (valuesArgs[clusterRef] +=
            ' --set "defaults.haproxy.service.type=LoadBalancer"' +
            ' --set "defaults.envoyProxy.service.type=LoadBalancer"' +
            ' --set "defaults.consensus.service.type=LoadBalancer"'),
      );
    }

    return valuesArgs;
  }

  /**
   * Adds the template string to the argument for each record
   * @param records - the records to iterate over
   * @param consensusNodes - the consensus nodes to iterate over
   * @param valuesArgs - the values arguments to add to
   * @param templateString - the template string to add
   */
  private addArgForEachRecord(
    records: Record<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    valuesArgs: Record<ClusterRef, string>,
    templateString: string,
  ): void {
    if (records) {
      consensusNodes.forEach(consensusNode => {
        if (records[consensusNode.name]) {
          const newTemplateString = templateString.replace('{nodeId}', consensusNode.nodeId.toString());
          valuesArgs[consensusNode.cluster] += newTemplateString.replace('{recordValue}', records[consensusNode.name]);
        }
      });
    }
  }

  async prepareNamespaces(config: NetworkDeployConfigClass) {
    const namespace = config.namespace;

    // check and create namespace in each cluster
    for (const context of config.contexts) {
      const k8client = this.k8Factory.getK8(context);
      if (!(await k8client.namespaces().has(namespace))) {
        this.logger.debug(`creating namespace '${namespace}' using context: ${context}`);
        await k8client.namespaces().create(namespace);
        this.logger.debug(`created namespace '${namespace}' using context: ${context}`);
      } else {
        this.logger.debug(`namespace '${namespace}' found using context: ${context}`);
      }
    }
  }

  async prepareConfig(task: any, argv: any, promptForNodeAliases: boolean = false) {
    this.configManager.update(argv);
    this.logger.debug('Updated config with argv', {config: this.configManager.config});

    const flagsWithDisabledPrompts = [
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

    const allFlags = [...NetworkCommand.DEPLOY_FLAGS_LIST.optional, ...NetworkCommand.DEPLOY_FLAGS_LIST.required];
    await this.configManager.executePrompt(task, allFlags);
    let namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    if (!namespace) {
      namespace = NamespaceName.of(this.configManager.getFlag<string>(flags.deployment));
    }
    this.configManager.setFlag(flags.namespace, namespace);

    // create a config object for subsequent steps
    const config: NetworkDeployConfigClass = this.configManager.getConfig(
      NetworkCommand.DEPLOY_CONFIGS_NAME,
      allFlags,
      [
        'chartPath',
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
      ],
    ) as NetworkDeployConfigClass;

    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
    }

    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
    }

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    // compute values
    config.chartPath = await prepareChartPath(
      this.helm,
      config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );

    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
    config.stagingKeysDir = PathEx.join(config.stagingDir, 'keys');

    config.resolvedThrottlesFile = resolveValidJsonFilePath(
      config.genesisThrottlesFile,
      flags.genesisThrottlesFile.definition.defaultValue as string,
    );

    config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    config.contexts = this.remoteConfigManager.getContexts();
    config.clusterRefs = this.remoteConfigManager.getClusterRefs();
    config.nodeAliases = parseNodeAliases(config.nodeAliasesUnparsed, config.consensusNodes, this.configManager);
    argv[flags.nodeAliasesUnparsed.name] = config.nodeAliases.join(',');

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

    this.logger.debug('Prepared config', {
      config,
      cachedConfig: this.configManager.config,
    });
    return config;
  }

  async destroyTask(ctx: NetworkDestroyContext, task: SoloListrTaskWrapper<NetworkDestroyContext>) {
    const self = this;
    task.title = `Uninstalling chart ${constants.SOLO_DEPLOYMENT_CHART}`;

    // Uninstall all 'solo deployment' charts for each cluster using the contexts
    await Promise.all(
      ctx.config.contexts.map(context => {
        return self.chartManager.uninstall(
          ctx.config.namespace,
          constants.SOLO_DEPLOYMENT_CHART,
          this.k8Factory.getK8(context).contexts().readCurrent(),
        );
      }),
    );

    // Delete Remote config inside each cluster
    task.title = `Deleting the RemoteConfig configmap in namespace ${ctx.config.namespace}`;
    await Promise.all(
      ctx.config.contexts.map(async context => {
        // Delete all if found
        this.k8Factory.getK8(context).configMaps().delete(ctx.config.namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
      }),
    );

    // Delete PVCs inside each cluster
    if (ctx.config.deletePvcs) {
      task.title = `Deleting PVCs in namespace ${ctx.config.namespace}`;

      await Promise.all(
        ctx.config.contexts.map(async context => {
          // Fetch all PVCs inside the namespace using the context
          const pvcs = await this.k8Factory.getK8(context).pvcs().list(ctx.config.namespace, []);

          // Delete all if found
          return Promise.all(
            pvcs.map(pvc =>
              this.k8Factory
                .getK8(context)
                .pvcs()
                .delete(PvcRef.of(ctx.config.namespace, PvcName.of(pvc))),
            ),
          );
        }),
      );
    }

    // Delete Secrets inside each cluster
    if (ctx.config.deleteSecrets) {
      task.title = `Deleting secrets in namespace ${ctx.config.namespace}`;

      await Promise.all(
        ctx.config.contexts.map(async context => {
          // Fetch all Secrets inside the namespace using the context
          const secrets = await this.k8Factory.getK8(context).secrets().list(ctx.config.namespace);

          // Delete all if found
          return Promise.all(
            secrets.map(secret => this.k8Factory.getK8(context).secrets().delete(ctx.config.namespace, secret.name)),
          );
        }),
      );
    }
  }

  /** Run helm install and deploy network components */
  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: NetworkDeployConfigClass;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            ctx.config = await self.prepareConfig(task, argv, true);
            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Copy gRPC TLS Certificates',
          task: (ctx, parentTask) =>
            self.certificateManager.buildCopyTlsCertificatesTasks(
              parentTask,
              ctx.config.grpcTlsCertificatePath,
              ctx.config.grpcWebTlsCertificatePath,
              ctx.config.grpcTlsKeyPath,
              ctx.config.grpcWebTlsKeyPath,
            ),
          skip: ctx => !ctx.config.grpcTlsCertificatePath && !ctx.config.grpcWebTlsCertificatePath,
        },
        {
          title: 'Check if cluster setup chart is installed',
          task: async ctx => {
            for (const context of ctx.config.contexts) {
              const isChartInstalled = await this.chartManager.isChartInstalled(
                null,
                constants.SOLO_CLUSTER_SETUP_CHART,
                context,
              );
              if (!isChartInstalled) {
                throw new SoloError(
                  `Chart ${constants.SOLO_CLUSTER_SETUP_CHART} is not installed for cluster: ${context}. Run 'solo cluster-ref setup'`,
                );
              }
            }
          },
        },
        {
          title: 'Prepare staging directory',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Copy Gossip keys to staging',
                  task: ctx => {
                    const config = ctx.config;
                    this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeAliases);
                  },
                },
                {
                  title: 'Copy gRPC TLS keys to staging',
                  task: ctx => {
                    const config = ctx.config;
                    for (const nodeAlias of config.nodeAliases) {
                      const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeAlias, config.keysDir);
                      self.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
                    }
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: 'Copy node keys to secrets',
          task: (ctx, parentTask) => {
            const config = ctx.config;

            // set up the subtasks
            return parentTask.newListr(
              self.platformInstaller.copyNodeKeys(config.stagingDir, config.consensusNodes, config.contexts),
              {
                concurrent: true,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async ctx => {
            const config = ctx.config;
            for (const clusterRef of Object.keys(config.clusterRefs)) {
              if (
                await self.chartManager.isChartInstalled(
                  config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  config.clusterRefs[clusterRef],
                )
              ) {
                await self.chartManager.uninstall(
                  config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  config.clusterRefs[clusterRef],
                );
              }

              await this.chartManager.install(
                config.namespace,
                constants.SOLO_DEPLOYMENT_CHART,
                ctx.config.chartPath,
                config.soloChartVersion,
                config.valuesArgMap[clusterRef],
                config.clusterRefs[clusterRef],
              );
              showVersionBanner(self.logger, SOLO_DEPLOYMENT_CHART, config.soloChartVersion);
            }
          },
        },
        {
          title: 'Check for load balancer',
          skip: ctx => ctx.config.loadBalancerEnabled === false,
          task: (ctx, task) => {
            const subTasks: SoloListrTask<Context>[] = [];
            const config = ctx.config;

            //Add check for network node service to be created and load balancer to be assigned (if load balancer is enabled)
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Load balancer is assigned for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async () => {
                  let attempts = 0;
                  let svc = null;

                  while (attempts < constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS) {
                    svc = await self.k8Factory
                      .getK8(consensusNode.context)
                      .services()
                      .list(config.namespace, [
                        `solo.hedera.com/node-id=${consensusNode.nodeId},solo.hedera.com/type=network-node-svc`,
                      ]);

                    if (svc && svc.length > 0 && svc[0].status?.loadBalancer?.ingress?.length > 0) {
                      let shouldContinue = false;
                      for (let i = 0; i < svc[0].status.loadBalancer.ingress.length; i++) {
                        const ingress = svc[0].status.loadBalancer.ingress[i];
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
        {
          title: 'Redeploy chart with external IP address config',
          skip: ctx => ctx.config.loadBalancerEnabled === false,
          task: async (ctx, task) => {
            // Update the valuesArgMap with the external IP addresses
            // This regenerates the config.txt and genesis-network.json files with the external IP addresses
            ctx.config.valuesArgMap = await this.prepareValuesArgMap(ctx.config);

            // Perform a helm upgrade for each cluster
            const subTasks: SoloListrTask<Context>[] = [];
            const config = ctx.config;
            for (const clusterRef of Object.keys(config.clusterRefs)) {
              subTasks.push({
                title: `Upgrade chart for cluster: ${chalk.yellow(clusterRef)}`,
                task: async () => {
                  await this.chartManager.upgrade(
                    config.namespace,
                    constants.SOLO_DEPLOYMENT_CHART,
                    ctx.config.chartPath,
                    config.soloChartVersion,
                    config.valuesArgMap[clusterRef],
                    config.clusterRefs[clusterRef],
                  );
                  showVersionBanner(self.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');

                  const context = config.clusterRefs[clusterRef];
                  const pods: Pod[] = await this.k8Factory
                    .getK8(context)
                    .pods()
                    .list(ctx.config.namespace, ['solo.hedera.com/type=network-node']);

                  for (const pod of pods) {
                    const podRef: PodRef = pod.podRef;
                    await this.k8Factory.getK8(context).pods().readByRef(podRef).killPod();
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
        self.waitForNetworkPods(),
        {
          title: 'Check proxy pods are running',
          task: (ctx, task) => {
            const subTasks: SoloListrTask<Context>[] = [];
            const config = ctx.config;

            // HAProxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async () =>
                  await self.k8Factory
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
                task: async () =>
                  await self.k8Factory
                    .getK8(consensusNode.context)
                    .pods()
                    .waitForRunningPhase(
                      ctx.config.namespace,
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
          task: (_, task) => {
            const subTasks: SoloListrTask<Context>[] = [];

            // minio
            subTasks.push({
              title: 'Check MinIO',
              task: async ctx => {
                for (const context of ctx.config.contexts) {
                  await self.k8Factory
                    .getK8(context)
                    .pods()
                    .waitForReadyStatus(
                      ctx.config.namespace,
                      ['v1.min.io/tenant=minio'],
                      constants.PODS_RUNNING_MAX_ATTEMPTS,
                      constants.PODS_RUNNING_DELAY,
                    );
                }
              },
              // skip if only cloud storage is/are used
              skip: ctx =>
                ctx.config.storageType === constants.StorageType.GCS_ONLY ||
                ctx.config.storageType === constants.StorageType.AWS_ONLY ||
                ctx.config.storageType === constants.StorageType.AWS_AND_GCS,
            });

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
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
    } finally {
      await lease.release();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    let networkDestroySuccess = true;
    const tasks = new Listr<NetworkDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the network components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.deletePvcs, flags.deleteSecrets]);

            ctx.config = {
              deletePvcs: self.configManager.getFlag<boolean>(flags.deletePvcs) as boolean,
              deleteSecrets: self.configManager.getFlag<boolean>(flags.deleteSecrets) as boolean,
              deployment: self.configManager.getFlag<string>(flags.deployment) as string,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              enableTimeout: self.configManager.getFlag<boolean>(flags.enableTimeout) as boolean,
              force: self.configManager.getFlag<boolean>(flags.force) as boolean,
              contexts: self.remoteConfigManager.getContexts(),
            };

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Remove deployment from local configuration',
          task: async (ctx, task) => {
            await this.localConfig.modify(async localConfigData => {
              localConfigData.removeDeployment(ctx.config.deployment);
            });
          },
        },
        {
          title: 'Running sub-tasks to destroy network',
          task: async (ctx, task) => {
            if (ctx.config.enableTimeout) {
              const timeoutId = setTimeout(async () => {
                const message = `\n\nUnable to finish network destroy in ${constants.NETWORK_DESTROY_WAIT_TIMEOUT} seconds\n\n`;
                self.logger.error(message);
                self.logger.showUser(chalk.red(message));
                networkDestroySuccess = false;

                if (ctx.config.deletePvcs && ctx.config.deleteSecrets) {
                  await Promise.all(
                    ctx.config.contexts.map(context =>
                      self.k8Factory.getK8(context).namespaces().delete(ctx.config.namespace),
                    ),
                  );
                } else {
                  // If the namespace is not being deleted,
                  // remove all components data from the remote configuration
                  await self.remoteConfigManager.deleteComponents();
                }
              }, constants.NETWORK_DESTROY_WAIT_TIMEOUT * 1_000);

              await self.destroyTask(ctx, task);

              clearTimeout(timeoutId);
            } else {
              await self.destroyTask(ctx, task);
            }
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
    } catch (e) {
      throw new SoloError('Error destroying network', e);
    } finally {
      // If the namespace is deleted, the lease can't be released
      await lease.release().catch();
    }

    return networkDestroySuccess;
  }

  getCommandDefinition() {
    const self = this;
    return {
      command: NetworkCommand.COMMAND_NAME,
      desc: 'Manage solo network deployment',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: "Deploy solo network.  Requires the chart `solo-cluster-setup` to have been installed in the cluster.  If it hasn't the following command can be ran: `solo cluster-ref setup`",
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: any) => {
              self.logger.info("==== Running 'network deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network deploy`====');

                  if (!r) throw new SoloError('Error deploying network, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error deploying network: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy solo network. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...NetworkCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...NetworkCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: any) => {
              self.logger.info("==== Running 'network destroy' ===");
              self.logger.info(argv);

              await self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network destroy`====');

                  if (!r) throw new SoloError('Error destroying network, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error destroying network: ${err.message}`, err);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public addNodesAndProxies(): SoloListrTask<any> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        const {
          config: {namespace},
        } = ctx;

        await this.remoteConfigManager.modify(async remoteConfig => {
          for (const consensusNode of ctx.config.consensusNodes) {
            remoteConfig.components.edit(
              new ConsensusNodeComponent(
                consensusNode.name,
                consensusNode.cluster,
                namespace.name,
                ConsensusNodeStates.REQUESTED,
                consensusNode.nodeId,
              ),
            );

            remoteConfig.components.add(
              new EnvoyProxyComponent(`envoy-proxy-${consensusNode.name}`, consensusNode.cluster, namespace.name),
            );

            remoteConfig.components.add(
              new HaProxyComponent(`haproxy-${consensusNode.name}`, consensusNode.cluster, namespace.name),
            );
          }
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
