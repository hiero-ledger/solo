// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import * as helpers from '../core/helpers.js';
import {prepareValuesFiles, showVersionBanner} from '../core/helpers.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as fs from 'node:fs';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentId,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  type Optional,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import * as versions from '../../version.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import chalk from 'chalk';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {KeyManager} from '../core/key-manager.js';
import {type Rbacs} from '../integration/kube/resources/rbac/rbacs.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {Lock} from '../core/lock/lock.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import * as semver from 'semver';
import {Base64} from 'js-base64';
import {Version} from '../business/utils/version.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {SemVer} from 'semver';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {Templates} from '../core/templates.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import yaml from 'yaml';
// Port forwarding is now a method on the components object

interface MirrorNodeDeployConfigClass {
  isChartInstalled: boolean;
  cacheDir: string;
  chartDirectory: string;
  mirrorNodeChartDirectory: string;
  clusterContext: string;
  clusterReference: ClusterReferenceName;
  namespace: NamespaceName;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  mirrorStaticIp: string;
  profileFile: string;
  profileName: string;
  valuesFile: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageReadAccessKey: string;
  storageReadSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  storageBucketRegion: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
  domainName: Optional<string>;
  forcePortForward: Optional<boolean>;
  releaseName: string;
  ingressReleaseName: string;
  newMirrorNodeComponent: MirrorNodeStateSchema;
  isLegacyChartInstalled: boolean;
  id: number;
}

interface MirrorNodeDeployContext {
  config: MirrorNodeDeployConfigClass;
  addressBook: string;
}

interface MirrorNodeUpgradeConfigClass {
  isChartInstalled: boolean;
  cacheDir: string;
  chartDirectory: string;
  mirrorNodeChartDirectory: string;
  clusterContext: string;
  clusterReference: ClusterReferenceName;
  namespace: NamespaceName;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  mirrorStaticIp: string;
  profileFile: string;
  profileName: string;
  valuesFile: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageReadAccessKey: string;
  storageReadSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  storageBucketRegion: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
  domainName: Optional<string>;
  forcePortForward: Optional<boolean>;
  releaseName: string;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
  id: number;
}

interface MirrorNodeUpgradeContext {
  config: MirrorNodeUpgradeConfigClass;
  addressBook: string;
}

interface MirrorNodeDestroyConfigClass {
  namespace: NamespaceName;
  clusterContext: string;
  isChartInstalled: boolean;
  clusterReference: ClusterReferenceName;
  id: ComponentId;
  releaseName: string;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
  isIngressControllerChartInstalled: boolean;
}

interface MirrorNodeDestroyContext {
  config: MirrorNodeDestroyConfigClass;
}

@injectable()
export class MirrorNodeCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.ProfileManager) private readonly profileManager?: ProfileManager,
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.cacheDir,
      flags.chartDirectory,
      flags.mirrorNodeChartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.mirrorStaticIp,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.pinger,
      flags.useExternalDatabase,
      flags.operatorId,
      flags.operatorKey,
      flags.storageType,
      flags.storageReadAccessKey,
      flags.storageReadSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.storageBucketRegion,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
      flags.domainName,
      flags.forcePortForward,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.clusterRef,
      flags.cacheDir,
      flags.chartDirectory,
      flags.mirrorNodeChartDirectory,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.mirrorStaticIp,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.pinger,
      flags.useExternalDatabase,
      flags.operatorId,
      flags.operatorKey,
      flags.storageType,
      flags.storageReadAccessKey,
      flags.storageReadSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.storageBucketRegion,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
      flags.domainName,
      flags.forcePortForward,
      flags.id,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.devMode, flags.id],
  };

  private prepareBlockNodeIntegrationValues(
    config: MirrorNodeUpgradeConfigClass | MirrorNodeDeployConfigClass,
  ): string {
    const configuration: RemoteConfig = this.remoteConfig.configuration;
    // TODO: re-enable block node integration when supported in mirror node: https://github.com/hiero-ledger/hiero-mirror-node/issues/12192
    // const blockNodeSchemas: ReadonlyArray<Readonly<BlockNodeStateSchema>> = configuration.components.state.blockNodes;
    const blockNodeSchemas: ReadonlyArray<Readonly<BlockNodeStateSchema>> = [];

    const clusterSchemas: ReadonlyArray<Readonly<ClusterSchema>> = configuration.clusters;

    if (blockNodeSchemas.length === 0) {
      this.logger.debug('No block nodes found in remote config configuration');
      return '';
    }

    this.logger.debug('Preparing mirror node values args overrides for block nodes integration');

    const blockNodeFqdnList: {host: string; port: number}[] = [];

    for (const blockNode of blockNodeSchemas) {
      const id: ComponentId = blockNode.metadata.id;
      const clusterReference: ClusterReferenceName = blockNode.metadata.cluster;

      const cluster: Readonly<ClusterSchema> = clusterSchemas.find(
        (cluster): boolean => cluster.name === clusterReference,
      );

      if (!cluster) {
        throw new SoloError(`Cluster ${clusterReference} not found in remote config`);
      }

      const serviceName: string = Templates.renderBlockNodeName(id);
      const namespace: NamespaceNameAsString = blockNode.metadata.namespace;
      const dnsBaseDomain: string = cluster.dnsBaseDomain;

      const fqdn: string = Templates.renderSvcFullyQualifiedDomainName(serviceName, namespace, dnsBaseDomain);

      blockNodeFqdnList.push({
        host: fqdn,
        port: constants.BLOCK_NODE_PORT,
      });
    }

    const data: {SPRING_PROFILES_ACTIVE: string} & Record<string, string | number> = {
      SPRING_PROFILES_ACTIVE: 'blocknode',
    };

    for (const [index, node] of blockNodeFqdnList.entries()) {
      data[`HIERO_MIRROR_IMPORTER_BLOCK_NODES_${index}_HOST`] = node.host;
      if (node.port !== constants.BLOCK_NODE_PORT) {
        data[`HIERO_MIRROR_IMPORTER_BLOCK_NODES_${index}_PORT`] = node.port;
      }
    }

    const mirrorNodeBlockNodeValues: {
      importer: {
        env: {SPRING_PROFILES_ACTIVE: string} & Record<string, string | number>;
      };
    } = {
      importer: {
        env: data,
      },
    };

    const mirrorNodeBlockNodeValuesYaml: string = yaml.stringify(mirrorNodeBlockNodeValues);

    const valuesFilePath: string = PathEx.join(config.cacheDir, 'mirror-bn-values.yaml');

    fs.writeFileSync(valuesFilePath, mirrorNodeBlockNodeValuesYaml);

    return ` --values ${valuesFilePath}`;
  }

  private async prepareValuesArg(config: MirrorNodeDeployConfigClass | MirrorNodeUpgradeConfigClass): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesForMirrorNodeChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArgument += ' --install';
    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    config.mirrorNodeVersion = Version.getValidSemanticVersion(config.mirrorNodeVersion, true, 'Mirror node version');

    const chartNamespace: string = this.getChartNamespace(config.mirrorNodeVersion);
    const environmentVariablePrefix: string = this.getEnvironmentVariablePrefix(config.mirrorNodeVersion);

    if (config.storageBucket) {
      valuesArgument += ` --set importer.config.${chartNamespace}.mirror.importer.downloader.bucketName=${config.storageBucket}`;
    }
    if (config.storageBucketPrefix) {
      this.logger.info(`Setting storage bucket prefix to ${config.storageBucketPrefix}`);
      valuesArgument += ` --set importer.config.${chartNamespace}.mirror.importer.downloader.pathPrefix=${config.storageBucketPrefix}`;
    }

    let storageType: string = '';
    if (
      config.storageType !== constants.StorageType.MINIO_ONLY &&
      config.storageReadAccessKey &&
      config.storageReadSecrets &&
      config.storageEndpoint
    ) {
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.AWS_AND_GCS
      ) {
        storageType = 'gcp';
      } else if (config.storageType === constants.StorageType.AWS_ONLY) {
        storageType = 's3';
      } else {
        throw new IllegalArgumentError(`Invalid cloud storage type: ${config.storageType}`);
      }

      const mapping: Record<string, string | boolean | number> = {
        [`importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_CLOUDPROVIDER`]: storageType,
        [`importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_ENDPOINTOVERRIDE`]:
          config.storageEndpoint,
        [`importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_ACCESSKEY`]: config.storageReadAccessKey,
        [`importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_SECRETKEY`]: config.storageReadSecrets,
      };
      valuesArgument += helpers.populateHelmArguments(mapping);
    }

    if (config.storageBucketRegion) {
      valuesArgument += ` --set importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_REGION=${config.storageBucketRegion}`;
    }

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.tls.enabled': false,
        'ingress.hosts[0].host': config.domainName,
      });
    }

    // if the useExternalDatabase populate all the required values before installing the chart
    if (config.useExternalDatabase) {
      const {
        externalDatabaseHost: host,
        externalDatabaseOwnerUsername: ownerUsername,
        externalDatabaseOwnerPassword: ownerPassword,
        externalDatabaseReadonlyUsername: readonlyUsername,
        externalDatabaseReadonlyPassword: readonlyPassword,
      } = config;

      valuesArgument += helpers.populateHelmArguments({
        // Disable default database deployment
        'stackgres.enabled': false,
        'postgresql.enabled': false,

        // Set the host and name
        'db.host': host,
        'db.name': 'mirror_node',

        // set the usernames
        'db.owner.username': ownerUsername,
        'importer.db.username': ownerUsername,

        'grpc.db.username': readonlyUsername,
        'restjava.db.username': readonlyUsername,
        'web3.db.username': readonlyUsername,

        // TODO: Fixes a problem where importer's V1.0__Init.sql migration fails
        // 'rest.db.username': readonlyUsername,

        // set the passwords
        'db.owner.password': ownerPassword,
        'importer.db.password': ownerPassword,

        'grpc.db.password': readonlyPassword,
        'restjava.db.password': readonlyPassword,
        'web3.db.password': readonlyPassword,
        'rest.db.password': readonlyPassword,
      });
    }

    valuesArgument += this.prepareBlockNodeIntegrationValues(config);

    return valuesArgument;
  }

  private async deployMirrorNode({config}: MirrorNodeDeployContext | MirrorNodeUpgradeContext): Promise<void> {
    if (
      config.isChartInstalled &&
      semver.gte(config.mirrorNodeVersion, versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION)
    ) {
      // migrating mirror node passwords from HEDERA_ (version 0.129.0) to HIERO_
      const existingSecrets: Secret = await this.k8Factory
        .getK8(config.clusterContext)
        .secrets()
        .read(config.namespace, 'mirror-passwords');
      const updatedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(existingSecrets.data)) {
        if (key.startsWith('HEDERA_')) {
          updatedData[key.replace('HEDERA_', 'HIERO_')] = value;
        } else {
          updatedData[key] = value;
        }
      }
      if (Object.keys(updatedData).length > 0) {
        await this.k8Factory
          .getK8(config.clusterContext)
          .secrets()
          .replace(config.namespace, 'mirror-passwords', SecretType.OPAQUE, updatedData);
      }
    }

    // Determine if we should reuse values based on the currently deployed version from remote config
    // If upgrading from a version <= MIRROR_NODE_VERSION_BOUNDARY, we need to skip reuseValues
    // to avoid RegularExpression rules from old version causing relay node request failures
    const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.MirrorNode);
    const shouldReuseValues: boolean = currentVersion
      ? semver.gt(currentVersion, constants.MIRROR_NODE_VERSION_BOUNDARY)
      : false; // If no current version (first install), don't reuse values

    await this.chartManager.upgrade(
      config.namespace,
      config.releaseName,
      constants.MIRROR_NODE_CHART,
      config.mirrorNodeChartDirectory || constants.MIRROR_NODE_RELEASE_NAME,
      config.mirrorNodeVersion,
      config.valuesArg,
      config.clusterContext,
      shouldReuseValues,
    );

    showVersionBanner(this.logger, constants.MIRROR_NODE_RELEASE_NAME, config.mirrorNodeVersion);

    if (config.enableIngress) {
      const existingIngressClasses: IngressClass[] = await this.k8Factory
        .getK8(config.clusterContext)
        .ingressClasses()
        .list();
      for (const ingressClass of existingIngressClasses) {
        this.logger.debug(`Found existing IngressClass [${ingressClass.name}]`);
        if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
          this.logger.showUser(`${constants.MIRROR_INGRESS_CLASS_NAME} already found, skipping`);
          return;
        }
      }

      await KeyManager.createTlsSecret(
        this.k8Factory,
        config.namespace,
        config.domainName,
        config.cacheDir,
        constants.MIRROR_INGRESS_TLS_SECRET_NAME,
      );
      // patch ingressClassName of mirror ingress, so it can be recognized by haproxy ingress controller
      const updated: object = {
        metadata: {
          annotations: {
            'haproxy-ingress.github.io/path-type': 'regex',
          },
        },
        spec: {
          ingressClassName: `${constants.MIRROR_INGRESS_CLASS_NAME}`,
          tls: [
            {
              hosts: [config.domainName || 'localhost'],
              secretName: constants.MIRROR_INGRESS_TLS_SECRET_NAME,
            },
          ],
        },
      };
      await this.k8Factory
        .getK8(config.clusterContext)
        .ingresses()
        .update(config.namespace, constants.MIRROR_NODE_RELEASE_NAME, updated);

      await this.k8Factory
        .getK8(config.clusterContext)
        .ingressClasses()
        .create(
          constants.MIRROR_INGRESS_CLASS_NAME,
          constants.INGRESS_CONTROLLER_PREFIX + constants.MIRROR_INGRESS_CONTROLLER,
        );
    }
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.MirrorNode),
    );
  }

  private getIngressReleaseName(): string {
    return this.renderIngressReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.MirrorNode),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.MIRROR_NODE_RELEASE_NAME}-${id}`;
  }

  private renderIngressReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${id}`;
  }

  private enableMirrorNodeTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable mirror-node',
      task: (_, parentTask): SoloListr<AnyListrContext> =>
        parentTask.newListr<MirrorNodeDeployContext>(
          [
            {
              title: 'Prepare address book',
              task: async (context_): Promise<void> => {
                const deployment: DeploymentName = this.configManager.getFlag(flags.deployment);
                const portForward: boolean = this.configManager.getFlag(flags.forcePortForward);
                context_.addressBook = await this.accountManager.prepareAddressBookBase64(
                  context_.config.namespace,
                  this.remoteConfig.getClusterRefs(),
                  deployment,
                  this.configManager.getFlag(flags.operatorId),
                  this.configManager.getFlag(flags.operatorKey),
                  portForward,
                );
                context_.config.valuesArg += ` --set "importer.addressBook=${context_.addressBook}"`;
              },
            },
            {
              title: 'Install mirror ingress controller',
              task: async (context_): Promise<void> => {
                const config: MirrorNodeDeployConfigClass = context_.config;

                let mirrorIngressControllerValuesArgument: string = ' --install ';
                mirrorIngressControllerValuesArgument += helpers.prepareValuesFiles(
                  constants.INGRESS_CONTROLLER_VALUES_FILE,
                );
                if (config.mirrorStaticIp !== '') {
                  mirrorIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${context_.config.mirrorStaticIp}`;
                }
                mirrorIngressControllerValuesArgument += ` --set fullnameOverride=${constants.MIRROR_INGRESS_CONTROLLER}-${config.namespace.name}`;
                mirrorIngressControllerValuesArgument += ` --set controller.ingressClass=${constants.MIRROR_INGRESS_CLASS_NAME}`;
                mirrorIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${constants.MIRROR_INGRESS_CONTROLLER}`;

                mirrorIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);

                await this.chartManager.upgrade(
                  config.namespace,
                  config.ingressReleaseName,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  INGRESS_CONTROLLER_VERSION,
                  mirrorIngressControllerValuesArgument,
                  context_.config.clusterContext,
                );
                showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);
              },
              skip: (context_): boolean => !context_.config.enableIngress,
            },
            {
              title: 'Deploy mirror-node',
              task: async (context_): Promise<void> => {
                await this.deployMirrorNode(context_);
              },
            },
          ],
          constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        ),
    };
  }

  private checkPodsAreReadyNodeTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check pods are ready',
      task: (context_, task): SoloListr<MirrorNodeDeployContext | MirrorNodeUpgradeContext> => {
        const subTasks: SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext>[] = [
          {
            title: 'Check Postgres DB',
            labels: ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/name=postgres'],
            skip: (): boolean => !!context_.config.useExternalDatabase,
          },
          {
            title: 'Check REST API',
            labels: ['app.kubernetes.io/component=rest', 'app.kubernetes.io/name=rest'],
          },
          {
            title: 'Check GRPC',
            labels: ['app.kubernetes.io/component=grpc', 'app.kubernetes.io/name=grpc'],
          },
          {
            title: 'Check Monitor',
            labels: ['app.kubernetes.io/component=monitor', 'app.kubernetes.io/name=monitor'],
          },
          {
            title: 'Check Web3',
            labels: ['app.kubernetes.io/component=web3', 'app.kubernetes.io/name=web3'],
          },
          {
            title: 'Check Importer',
            labels: ['app.kubernetes.io/component=importer', 'app.kubernetes.io/name=importer'],
          },
        ].map(
          ({
            title,
            labels,
            skip,
          }: {
            title: string;
            labels: string[];
            skip?: () => boolean;
          }): SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext> => {
            const task: SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext> = {
              title: title,
              task: async (): Promise<Pod[]> =>
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .pods()
                  .waitForReadyStatus(
                    context_.config.namespace,
                    labels,
                    constants.PODS_READY_MAX_ATTEMPTS,
                    constants.PODS_READY_DELAY,
                  ),
            };

            if (skip) {
              task.skip = skip;
            }

            return task;
          },
        );

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  private seedDbDataTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Seed DB data',
      skip: ({config}: MirrorNodeDeployContext): boolean => config.isChartInstalled,
      task: (_, parentTask): SoloListr<AnyListrContext> =>
        parentTask.newListr(
          [
            {
              title: 'Insert data in public.file_data',
              task: async ({config}: MirrorNodeDeployContext): Promise<void> => {
                const namespace: NamespaceName = config.namespace;

                const feesFileIdNumber: number = 111;
                const exchangeRatesFileIdNumber: number = 112;
                const timestamp: number = Date.now();

                const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
                const deployment: DeploymentName = this.configManager.getFlag(flags.deployment);
                const fees: string = await this.accountManager.getFileContents(
                  namespace,
                  feesFileIdNumber,
                  clusterReferences,
                  deployment,
                  this.configManager.getFlag<boolean>(flags.forcePortForward),
                );
                const exchangeRates: string = await this.accountManager.getFileContents(
                  namespace,
                  exchangeRatesFileIdNumber,
                  clusterReferences,
                  deployment,
                  this.configManager.getFlag<boolean>(flags.forcePortForward),
                );

                const importFeesQuery: string = `
INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) 
VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'}, ${feesFileIdNumber}, 17);`;
                const importExchangeRatesQuery: string = `
INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) 
VALUES (decode('${exchangeRates}', 'hex'), ${timestamp + '000001'}, ${exchangeRatesFileIdNumber}, 17);`;
                const sqlQuery: string = [importFeesQuery, importExchangeRatesQuery].join('\n');

                const cacheDirectory: string = config.cacheDir;
                // Build the path
                const databaseSeedingQueryFileName: string = 'database-seeding-query.sql';
                const databaseSeedingQueryPath: string = PathEx.join(cacheDirectory, databaseSeedingQueryFileName);

                // Write the file database seeding query inside the cache
                fs.writeFileSync(databaseSeedingQueryPath, sqlQuery);

                // When useExternalDatabase flag is enabled, the query is not executed,
                // but exported to the specified path inside the cache directory,
                // and the user has the responsibility to execute it manually on his own
                if (config.useExternalDatabase) {
                  // Notify the user
                  this.logger.showUser(
                    chalk.cyan(
                      'Please run the following SQL script against the external database ' +
                        'to enable Mirror Node to function correctly:',
                    ),
                    chalk.yellow(databaseSeedingQueryPath),
                  );

                  return; //! stop the execution
                }

                const pods: Pod[] = await this.k8Factory
                  .getK8(config.clusterContext)
                  .pods()
                  .list(namespace, ['app.kubernetes.io/name=postgres']);
                if (pods.length === 0) {
                  throw new SoloError('postgres pod not found');
                }
                const postgresPodName: PodName = pods[0].podReference.name;
                const postgresContainerName: ContainerName = ContainerName.of('postgresql');
                const postgresPodReference: PodReference = PodReference.of(namespace, postgresPodName);
                const containerReference: ContainerReference = ContainerReference.of(
                  postgresPodReference,
                  postgresContainerName,
                );
                const mirrorEnvironmentVariables: string = await this.k8Factory
                  .getK8(config.clusterContext)
                  .containers()
                  .readByRef(containerReference)
                  .execContainer('/bin/bash -c printenv');
                const mirrorEnvironmentVariablesArray: string[] = mirrorEnvironmentVariables.split('\n');
                const environmentVariablePrefix: string = this.getEnvironmentVariablePrefix(config.mirrorNodeVersion);

                const MIRROR_IMPORTER_DB_OWNER: string = helpers.getEnvironmentValue(
                  mirrorEnvironmentVariablesArray,
                  `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`,
                );
                const MIRROR_IMPORTER_DB_OWNERPASSWORD: string = helpers.getEnvironmentValue(
                  mirrorEnvironmentVariablesArray,
                  `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`,
                );
                const MIRROR_IMPORTER_DB_NAME: string = helpers.getEnvironmentValue(
                  mirrorEnvironmentVariablesArray,
                  `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`,
                );

                const targetDirectory: string = '/tmp';
                const targetPath: string = `${targetDirectory}/${databaseSeedingQueryFileName}`;

                await this.k8Factory
                  .getK8(config.clusterContext)
                  .containers()
                  .readByRef(containerReference)
                  .copyTo(databaseSeedingQueryPath, targetDirectory);

                await this.k8Factory
                  .getK8(config.clusterContext)
                  .containers()
                  .readByRef(containerReference)
                  .execContainer([
                    'psql',
                    `postgresql://${MIRROR_IMPORTER_DB_OWNER}:${MIRROR_IMPORTER_DB_OWNERPASSWORD}@localhost:5432/${MIRROR_IMPORTER_DB_NAME}`,
                    '-f',
                    targetPath,
                  ]);
              },
            },
          ],
          constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        ),
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for mirror ingress controller',
      skip: ({config}: MirrorNodeDeployContext): boolean => !config.forcePortForward || !config.enableIngress,
      task: async ({config}: MirrorNodeDeployContext): Promise<void> => {
        const pods: Pod[] = await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .list(config.namespace, [`app.kubernetes.io/instance=${config.ingressReleaseName}`]);
        if (pods.length === 0) {
          throw new SoloError('No mirror ingress controller pod found');
        }
        let podReference: PodReference;
        for (const pod of pods) {
          if (pod?.podReference?.name?.name?.startsWith('mirror-ingress')) {
            podReference = pod.podReference;
            break;
          }
        }

        await this.remoteConfig.configuration.components.managePortForward(
          config.clusterReference,
          podReference,
          80, // Pod port
          constants.MIRROR_NODE_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.MirrorNode,
          'Mirror ingress controller',
          config.isChartInstalled, // Reuse existing port if chart is already installed
        );
        await this.remoteConfig.persist();
      },
    };
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeDeployContext> = this.taskList.newTaskList<MirrorNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);
            lease = await this.leaseManager.create();
            this.configManager.update(argv);

            flags.disablePrompts(MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.required,
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: MirrorNodeDeployConfigClass = this.configManager.getConfig(
              MirrorNodeCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
              [],
            ) as MirrorNodeDeployConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterReference = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterReference);

            config.newMirrorNodeComponent = this.componentFactory.createNewMirrorNodeComponent(
              config.clusterReference,
              config.namespace,
            );

            config.id = config.newMirrorNodeComponent.metadata.id;

            if (process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME) {
              config.releaseName = constants.MIRROR_NODE_RELEASE_NAME;
              config.ingressReleaseName = `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${config.namespace.name}`;
            } else {
              config.releaseName = this.getReleaseName();
              config.ingressReleaseName = this.getIngressReleaseName();
            }

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.clusterContext,
            );

            // predefined values first
            config.valuesArg = helpers.prepareValuesFiles(
              semver.lt(config.mirrorNodeVersion, versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION)
                ? constants.MIRROR_NODE_VALUES_FILE_HEDERA
                : constants.MIRROR_NODE_VALUES_FILE,
            );

            // user defined values later to override predefined values
            config.valuesArg += await this.prepareValuesArg(config);

            const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              deploymentName,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            const realm: Realm = this.localConfig.configuration.realmForDeployment(deploymentName);
            const shard: Shard = this.localConfig.configuration.shardForDeployment(deploymentName);
            const chartNamespace: string = this.getChartNamespace(config.mirrorNodeVersion);

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restJava', 'graphql', 'rosetta', 'web3'];
            for (const module of modules) {
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.realm=${realm}`;
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.shard=${shard}`;
            }

            if (config.pinger) {
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=${constants.MIRROR_NODE_PINGER_TPS}`;

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(deploymentName).toString();
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.accountId=${operatorId}`;

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${config.operatorKey}`;
              } else {
                try {
                  const namespace: NamespaceName = await resolveNamespaceFromDeployment(
                    this.localConfig,
                    this.configManager,
                    task,
                  );

                  const secrets: Secret[] = await this.k8Factory
                    .getK8(config.clusterContext)
                    .secrets()
                    .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                  if (secrets.length === 0) {
                    this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${constants.OPERATOR_KEY}`;
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                  }
                } catch (error) {
                  throw new SoloError(`Error getting operator key: ${error.message}`, error);
                }
              }
            } else {
              context_.config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=0`;
            }

            const isQuiet: boolean = config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (config.useExternalDatabase && !isQuiet) {
              await this.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              config.useExternalDatabase &&
              (!config.externalDatabaseHost ||
                !config.externalDatabaseOwnerUsername ||
                !config.externalDatabaseOwnerPassword ||
                !config.externalDatabaseReadonlyUsername ||
                !config.externalDatabaseReadonlyPassword)
            ) {
              const missingFlags: CommandFlag[] = [];
              if (!config.externalDatabaseHost) {
                missingFlags.push(flags.externalDatabaseHost);
              }
              if (!config.externalDatabaseOwnerUsername) {
                missingFlags.push(flags.externalDatabaseOwnerUsername);
              }
              if (!config.externalDatabaseOwnerPassword) {
                missingFlags.push(flags.externalDatabaseOwnerPassword);
              }

              if (!config.externalDatabaseReadonlyUsername) {
                missingFlags.push(flags.externalDatabaseReadonlyUsername);
              }
              if (!config.externalDatabaseReadonlyPassword) {
                missingFlags.push(flags.externalDatabaseReadonlyPassword);
              }

              if (missingFlags.length > 0) {
                const errorMessage: string =
                  'There are missing values that need to be provided when' +
                  `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

                throw new SoloError(
                  `${errorMessage} ${missingFlags.map((flag): string => `--${flag.name}`).join(', ')}`,
                );
              }
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.enableMirrorNodeTask(),
        this.checkPodsAreReadyNodeTask(),
        this.seedDbDataTask(),
        this.addMirrorNodeComponents(),
        this.enablePortForwardingTask(),
        // TODO only show this if we are not running in one-shot mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DESTROY,
      undefined,
      'mirror node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('mirror node add has completed');
      } catch (error) {
        throw new SoloError(`Error adding mirror node: ${error.message}`, error);
      } finally {
        await lease?.release();
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
        await this.accountManager.close();
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeUpgradeContext> = this.taskList.newTaskList<MirrorNodeUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();
            this.configManager.update(argv);

            flags.disablePrompts(MirrorNodeCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...MirrorNodeCommand.UPGRADE_FLAGS_LIST.required,
              ...MirrorNodeCommand.UPGRADE_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: MirrorNodeUpgradeConfigClass = this.configManager.getConfig(
              MirrorNodeCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
              [],
            ) as MirrorNodeUpgradeConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterReference = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterReference);

            const {id, releaseName, isChartInstalled, ingressReleaseName, isLegacyChartInstalled} =
              await this.inferDestroyData(config.namespace, config.clusterContext);

            config.id = id;
            config.releaseName = releaseName;
            config.isChartInstalled = isChartInstalled;
            config.ingressReleaseName = ingressReleaseName;
            config.isLegacyChartInstalled = isLegacyChartInstalled;

            if (process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME) {
              config.releaseName = constants.MIRROR_NODE_RELEASE_NAME;
              config.ingressReleaseName = constants.INGRESS_CONTROLLER_RELEASE_NAME;
            }

            // predefined values first
            config.valuesArg = semver.lt(config.mirrorNodeVersion, versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION)
              ? helpers.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE_HEDERA)
              : helpers.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE);

            // user defined values later to override predefined values
            config.valuesArg += await this.prepareValuesArg(config);

            const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              deploymentName,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            const realm: Realm = this.localConfig.configuration.realmForDeployment(deploymentName);
            const shard: Shard = this.localConfig.configuration.shardForDeployment(deploymentName);
            const chartNamespace: string = this.getChartNamespace(config.mirrorNodeVersion);

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restJava', 'graphql', 'rosetta', 'web3'];
            for (const module of modules) {
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.realm=${realm}`;
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.shard=${shard}`;
            }

            if (config.pinger) {
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=5`;

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(deploymentName).toString();
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.accountId=${operatorId}`;

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${config.operatorKey}`;
              } else {
                try {
                  const namespace: NamespaceName = await resolveNamespaceFromDeployment(
                    this.localConfig,
                    this.configManager,
                    task,
                  );

                  const secrets: Secret[] = await this.k8Factory
                    .getK8(config.clusterContext)
                    .secrets()
                    .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                  if (secrets.length === 0) {
                    this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${constants.OPERATOR_KEY}`;
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                  }
                } catch (error) {
                  throw new SoloError(`Error getting operator key: ${error.message}`, error);
                }
              }
            } else {
              context_.config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=0`;
            }

            const isQuiet: boolean = config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (config.useExternalDatabase && !isQuiet) {
              await this.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              config.useExternalDatabase &&
              (!config.externalDatabaseHost ||
                !config.externalDatabaseOwnerUsername ||
                !config.externalDatabaseOwnerPassword ||
                !config.externalDatabaseReadonlyUsername ||
                !config.externalDatabaseReadonlyPassword)
            ) {
              const missingFlags: CommandFlag[] = [];
              if (!config.externalDatabaseHost) {
                missingFlags.push(flags.externalDatabaseHost);
              }
              if (!config.externalDatabaseOwnerUsername) {
                missingFlags.push(flags.externalDatabaseOwnerUsername);
              }
              if (!config.externalDatabaseOwnerPassword) {
                missingFlags.push(flags.externalDatabaseOwnerPassword);
              }

              if (!config.externalDatabaseReadonlyUsername) {
                missingFlags.push(flags.externalDatabaseReadonlyUsername);
              }
              if (!config.externalDatabaseReadonlyPassword) {
                missingFlags.push(flags.externalDatabaseReadonlyPassword);
              }

              if (missingFlags.length > 0) {
                const errorMessage: string =
                  'There are missing values that need to be provided when' +
                  `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

                throw new SoloError(`${errorMessage} ${missingFlags.map(flag => `--${flag.name}`).join(', ')}`);
              }
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.enableMirrorNodeTask(),
        this.checkPodsAreReadyNodeTask(),
        this.enablePortForwardingTask(),
        // TODO only show this if we are not running in quick-start mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'mirror node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('mirror node upgrade has completed');
      } catch (error) {
        throw new SoloError(`Error upgrading mirror node: ${error.message}`, error);
      } finally {
        await lease.release();
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease.release();
        await this.accountManager.close();
      });
    }

    return true;
  }

  private getEnvironmentVariablePrefix(version: string): string {
    return semver.lt(version, versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION) ? 'HEDERA' : 'HIERO';
  }

  private getChartNamespace(version: string): string {
    return semver.lt(version, versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION) ? 'hedera' : 'hiero';
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;
    let remoteConfigLoaded: boolean = false;

    const tasks: SoloListr<MirrorNodeDestroyContext> = this.taskList.newTaskList<MirrorNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            remoteConfigLoaded = true;
            lease = await this.leaseManager.create();
            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the mirror node components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);

            const namespace: NamespaceName = await this.getNamespace(task);
            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const clusterContext: Context = this.getClusterContext(clusterReference);

            await this.throwIfNamespaceIsMissing(clusterContext, namespace);

            const {id, releaseName, isChartInstalled, ingressReleaseName, isLegacyChartInstalled} =
              await this.inferDestroyData(namespace, clusterContext);

            context_.config = {
              clusterContext,
              namespace,
              clusterReference,
              id,
              isChartInstalled,
              releaseName,
              ingressReleaseName,
              isLegacyChartInstalled,
              isIngressControllerChartInstalled: await this.chartManager.isChartInstalled(
                namespace,
                ingressReleaseName,
                clusterContext,
              ),
            };

            if (remoteConfigLoaded) {
              await this.accountManager.loadNodeClient(
                context_.config.namespace,
                this.remoteConfig.getClusterRefs(),
                this.configManager.getFlag<DeploymentName>(flags.deployment),
                this.configManager.getFlag<boolean>(flags.forcePortForward),
              );
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy mirror-node',
          task: async (context_): Promise<void> => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.clusterContext,
            );
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async (context_): Promise<void> => {
            // filtering postgres and redis PVCs using instance labels
            // since they have different name or component labels
            const pvcs: string[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pvcs()
              .list(context_.config.namespace, [`app.kubernetes.io/instance=${context_.config.releaseName}`]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .pvcs()
                  .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc)));
              }
            }
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        {
          title: 'Uninstall mirror ingress controller',
          skip: (context_): boolean => !context_.config.isIngressControllerChartInstalled,
          task: async (context_): Promise<void> => {
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .delete(constants.MIRROR_INGRESS_CLASS_NAME);

            if (
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .configMaps()
                .exists(context_.config.namespace, 'ingress-controller-leader-' + constants.MIRROR_INGRESS_CLASS_NAME)
            ) {
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .configMaps()
                .delete(context_.config.namespace, 'ingress-controller-leader-' + constants.MIRROR_INGRESS_CLASS_NAME);
            }

            await this.chartManager.uninstall(
              context_.config.namespace,
              context_.config.ingressReleaseName,
              context_.config.clusterContext,
            );
            // delete ingress class if found one
            const existingIngressClasses: IngressClass[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map((ingressClass): void => {
              if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
                this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(constants.MIRROR_INGRESS_CLASS_NAME);
              }
            });
          },
        },
        {
          title: 'Cleanup mirror ingress controller RBAC',
          task: async (context_): Promise<void> => {
            const rbac: Rbacs = this.k8Factory.getK8(context_.config.clusterContext).rbac();
            if (await rbac.clusterRoleBindingExists(constants.MIRROR_INGRESS_CONTROLLER)) {
              await rbac.deleteClusterRoleBinding(constants.MIRROR_INGRESS_CONTROLLER);
            }
            if (await rbac.clusterRoleExists(constants.MIRROR_INGRESS_CONTROLLER)) {
              await rbac.deleteClusterRole(constants.MIRROR_INGRESS_CONTROLLER);
            }
          },
        },
        this.disableMirrorNodeComponents(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'mirror node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error destroying mirror node: ${error.message}`, error);
      } finally {
        await this.accountManager?.close().catch();
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await this.accountManager?.close().catch();
        await lease?.release();
      });
    }

    return true;
  }

  /** Removes the mirror node components from remote config. */
  public disableMirrorNodeComponents(): SoloListrTask<MirrorNodeDestroyContext> {
    return {
      title: 'Remove mirror node from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(context_.config.id, ComponentTypes.MirrorNode);

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the mirror node components to remote config. */
  public addMirrorNodeComponents(): SoloListrTask<MirrorNodeDeployContext> {
    return {
      title: 'Add mirror node to remote config',
      skip: (context_): boolean => {
        return !this.remoteConfig.isLoaded() || context_.config.isChartInstalled;
      },
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          context_.config.newMirrorNodeComponent,
          ComponentTypes.MirrorNode,
        );
        // update mirror node version in remote config
        this.remoteConfig.updateComponentVersion(
          ComponentTypes.MirrorNode,
          new SemVer(context_.config.mirrorNodeVersion),
        );
        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    return id === 1
      ? await this.chartManager.isChartInstalled(namespace, constants.MIRROR_NODE_RELEASE_NAME, context)
      : false;
  }

  private inferMirrorNodeId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);

    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.mirrorNodes.length === 0) {
      throw new SoloError('Mirror node not found in remote config');
    }

    return this.remoteConfig.configuration.components.state.mirrorNodes[0].metadata.id;
  }

  private async inferDestroyData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    id: ComponentId;
    releaseName: string;
    isChartInstalled: boolean;
    ingressReleaseName: string;
    isLegacyChartInstalled: boolean;
  }> {
    const id: ComponentId = this.inferMirrorNodeId();

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: constants.MIRROR_NODE_RELEASE_NAME,
        isChartInstalled: true,
        ingressReleaseName: constants.INGRESS_CONTROLLER_RELEASE_NAME,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    const ingressReleaseName: string = this.renderIngressReleaseName(id);
    return {
      id,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      ingressReleaseName,
      isLegacyChartInstalled,
    };
  }
}
