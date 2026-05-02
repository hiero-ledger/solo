// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import * as helpers from '../core/helpers.js';
import {prepareValuesFiles, showVersionBanner} from '../core/helpers.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type Rbacs} from '../integration/kube/resources/rbac/rbacs.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as fs from 'node:fs';
import {
  type ClusterReferenceName,
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
import * as versions from '../../version.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {type Pods} from '../integration/kube/resources/pod/pods.js';
import chalk from 'chalk';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {KeyManager} from '../core/key-manager.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {Lock} from '../core/lock/lock.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Base64} from 'js-base64';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {assertUpgradeVersionNotOlder} from '../core/upgrade-version-guard.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {PostgresStateSchema} from '../data/schema/model/remote/state/postgres-state-schema.js';
import {RedisStateSchema} from '../data/schema/model/remote/state/redis-state-schema.js';
import {Templates} from '../core/templates.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import yaml from 'yaml';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {PostgresSharedResource} from '../core/shared-resources/postgres.js';
import {SharedResourceManager} from '../core/shared-resources/shared-resource-manager.js';
import {MirrorNodeDeployedEvent} from '../core/events/event-types/mirror-node-deployed-event.js';
import {type SoloEventBus} from '../core/events/solo-event-bus.js';
import {optionFromFlag} from './command-helpers.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
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
  valuesFile: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  componentImage: string;
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
  soloChartVersion: string;
  deployment: DeploymentName;
  forceBlockNodeIntegration: boolean; // Used to bypass version requirements for block node integration
  installSharedResources: boolean;
  parallelDeploy: boolean;
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
  valuesFile: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  componentImage: string;
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
  soloChartVersion: string;
  installSharedResources: boolean;
  forceBlockNodeIntegration: boolean; // Used to bypass version requirements for block node integration
  deployment: DeploymentName;
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

interface InferredData {
  id: ComponentId;
  releaseName: string;
  isChartInstalled: boolean;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
}

enum MirrorNodeCommandType {
  ADD = 'add',
  UPGRADE = 'upgrade',
  DESTROY = 'destroy',
}

@injectable()
export class MirrorNodeCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.PostgresSharedResource) private readonly postgresSharedResource: PostgresSharedResource,
    @inject(InjectTokens.SharedResourceManager) private readonly sharedResourceManager: SharedResourceManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus?: SoloEventBus,
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.postgresSharedResource = patchInject(
      postgresSharedResource,
      InjectTokens.PostgresSharedResource,
      this.constructor.name,
    );
    this.sharedResourceManager = patchInject(
      sharedResourceManager,
      InjectTokens.SharedResourceManager,
      this.constructor.name,
    );
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
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.componentImage,
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
      flags.externalAddress,
      flags.soloChartVersion,
      flags.forceBlockNodeIntegration, // Used to bypass version requirements for block node integration
      flags.parallelDeploy,
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
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.componentImage,
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
      flags.externalAddress,
      flags.id,
      flags.soloChartVersion,
      flags.forceBlockNodeIntegration, // Used to bypass version requirements for block node integration
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
    const blockNodeSchemas: ReadonlyArray<Readonly<BlockNodeStateSchema>> = configuration.components.state.blockNodes;

    if (blockNodeSchemas.length === 0) {
      this.logger.debug('No block nodes found in remote config configuration');
      return '';
    }

    let shouldConfigureMirrorNodeToPullFromBlockNode: boolean;

    if (config.forceBlockNodeIntegration) {
      // Bypass following checks
      this.logger.warn('Force flag enabled, bypassing version checks for block node integration');
      shouldConfigureMirrorNodeToPullFromBlockNode = true;
    } else {
      const isConsensusNodeVersionSupported: boolean =
        this.remoteConfig.configuration.versions.consensusNode.greaterThanOrEqual(
          versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS,
        );

      const isBlockNodeChartVersionSupported: boolean =
        this.remoteConfig.configuration.versions.blockNodeChart.greaterThanOrEqual(
          versions.MINIMUM_BLOCK_NODE_CHART_VERSION_FOR_MIRROR_NODE_INTEGRATION,
        );

      const isMirrorNodeVersionSupported: boolean = new SemanticVersion<string>(
        config.mirrorNodeVersion,
      ).greaterThanOrEqual(versions.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_MIRROR_NODE_INTEGRATION);

      shouldConfigureMirrorNodeToPullFromBlockNode =
        isConsensusNodeVersionSupported && isBlockNodeChartVersionSupported && isMirrorNodeVersionSupported;
    }

    if (!shouldConfigureMirrorNodeToPullFromBlockNode) {
      this.logger.info(
        'Mirror node will remain configured to pull from consensus node because version requirements were not met',
      );
      return '';
    }

    const clusterSchemas: ReadonlyArray<Readonly<ClusterSchema>> = configuration.clusters;

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

    valuesArgument += ' --install';
    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    config.mirrorNodeVersion = SemanticVersion.getValidSemanticVersion(
      config.mirrorNodeVersion,
      true,
      'Mirror node version',
    );

    const chartNamespace: string = this.getChartNamespace(config.mirrorNodeVersion);
    const environmentVariablePrefix: string = this.getEnvironmentVariablePrefix(config.mirrorNodeVersion);

    if (config.componentImage) {
      const parsedImageReference: ParsedImageReference = ImageReference.parseImageReference(config.componentImage);
      valuesArgument += helpers.populateHelmArguments({
        'importer.image.registry': parsedImageReference.registry,
        'grpc.image.registry': parsedImageReference.registry,
        'rest.image.registry': parsedImageReference.registry,
        'restjava.image.registry': parsedImageReference.registry,
        'web3.image.registry': parsedImageReference.registry,
        'monitor.image.registry': parsedImageReference.registry,
        'importer.image.repository': parsedImageReference.repository,
        'grpc.image.repository': parsedImageReference.repository,
        'rest.image.repository': parsedImageReference.repository,
        'restjava.image.repository': parsedImageReference.repository,
        'web3.image.repository': parsedImageReference.repository,
        'monitor.image.repository': parsedImageReference.repository,
        'importer.image.tag': parsedImageReference.tag,
        'grpc.image.tag': parsedImageReference.tag,
        'rest.image.tag': parsedImageReference.tag,
        'restjava.image.tag': parsedImageReference.tag,
        'web3.image.tag': parsedImageReference.tag,
        'monitor.image.tag': parsedImageReference.tag,
      });
    }

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
    let host: string, ownerPassword: string, ownerUsername: string, readonlyPassword: string, readonlyUsername: string;
    valuesArgument += helpers.populateHelmArguments({
      // Disable default database deployment
      'stackgres.enabled': false,
      'postgresql.enabled': false,
      'db.name': 'mirror_node',
    });

    if (config.useExternalDatabase) {
      host = config.externalDatabaseHost;
      ownerPassword = config.externalDatabaseOwnerPassword;
      ownerUsername = config.externalDatabaseOwnerUsername;
      readonlyUsername = config.externalDatabaseReadonlyUsername;
      readonlyPassword = config.externalDatabaseReadonlyPassword;

      valuesArgument += helpers.populateHelmArguments({
        // Set the host and name
        'db.host': host,

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
    } else {
      valuesArgument += helpers.populateHelmArguments({
        'db.host': `solo-shared-resources-postgres.${config.namespace.name}.svc.cluster.local`,
      });
    }

    valuesArgument += this.prepareBlockNodeIntegrationValues(config);

    return valuesArgument;
  }

  private async deployMirrorNode(
    {config}: MirrorNodeDeployContext | MirrorNodeUpgradeContext,
    commandType: MirrorNodeCommandType,
  ): Promise<void> {
    if (
      config.isChartInstalled &&
      new SemanticVersion<string>(config.mirrorNodeVersion).greaterThanOrEqual(
        versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION,
      )
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
    const currentVersion: SemanticVersion<string> | null = this.remoteConfig.getComponentVersion(
      ComponentTypes.MirrorNode,
    );
    let shouldReuseValues: boolean = currentVersion
      ? currentVersion.greaterThan(constants.MIRROR_NODE_VERSION_BOUNDARY)
      : false; // If no current version (first install), don't reuse values

    // Don't reuse values when crossing the shared-resources/memory-improvements boundary
    // (upgrading from < v0.152.0 → >= v0.152.0).  Versions before this boundary used an
    // embedded chart-managed Redis with sentinel nodes pointed at "<release>-redis".
    // Reusing those old values would leak the stale "SPRING_DATA_REDIS_SENTINEL_NODES"
    // configuration into the upgraded pods even though redis.enabled is now set to false,
    // because --reuse-values merges ALL old chart values (including sentinel node addresses)
    // and we only explicitly override redis.enabled / redis.host / redis.port — not every
    // sentinel sub-key.  Forcing a clean value set here prevents pods from failing to
    // resolve the no-longer-existent "<release>-redis" hostname.
    if (
      shouldReuseValues &&
      currentVersion !== null &&
      currentVersion.lessThan(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION) &&
      new SemanticVersion<string>(config.mirrorNodeVersion).greaterThanOrEqual(
        versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION,
      )
    ) {
      shouldReuseValues = false;
    }

    if (commandType === MirrorNodeCommandType.ADD) {
      shouldReuseValues = false;
    }

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

    this.eventBus.emit(new MirrorNodeDeployedEvent(config.deployment));

    showVersionBanner(this.logger, constants.MIRROR_NODE_RELEASE_NAME, config.mirrorNodeVersion);

    if (commandType === MirrorNodeCommandType.ADD) {
      this.remoteConfig.configuration.components.changeComponentPhase(
        (config as MirrorNodeDeployConfigClass).newMirrorNodeComponent.metadata.id,
        ComponentTypes.MirrorNode,
        DeploymentPhase.DEPLOYED,
      );

      await this.remoteConfig.persist();
    } else if (commandType === MirrorNodeCommandType.UPGRADE) {
      // update mirror node version in remote config after successful upgrade
      this.remoteConfig.updateComponentVersion(
        ComponentTypes.MirrorNode,
        new SemanticVersion<string>(config.mirrorNodeVersion),
      );

      await this.remoteConfig.persist();
    }

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

  private enableSharedResourcesTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable shared resources',
      task: async (_, task): Promise<SoloListr<AnyListrContext>> => {
        const subTasks: SoloListrTask<AnyListrContext>[] = [
          {
            title: 'Install Shared Resources chart',
            task: async (context_): Promise<void> => {
              if (!context_.config.useExternalDatabase) {
                this.sharedResourceManager.enablePostgres();
              }

              this.sharedResourceManager.enableRedis();
              context_.config.installSharedResources = await this.sharedResourceManager.installChart(
                context_.config.namespace,
                context_.config.chartDirectory,
                context_.config.soloChartVersion,
                context_.config.clusterContext,
                {
                  'redis.image.registry': constants.REDIS_IMAGE_REGISTRY,
                  'redis.image.repository': constants.REDIS_IMAGE_REPOSITORY,
                  'redis.image.tag': versions.REDIS_IMAGE_VERSION,
                  'redis.sentinel.image.registry': constants.REDIS_SENTINEL_IMAGE_REGISTRY,
                  'redis.sentinel.image.repository': constants.REDIS_SENTINEL_IMAGE_REPOSITORY,
                  'redis.sentinel.image.tag': versions.REDIS_SENTINEL_IMAGE_VERSION,
                  'redis.sentinel.masterSet': constants.REDIS_SENTINEL_MASTER_SET,
                },
              );
            },
          },
          {
            title: 'Load redis credentials',
            task: async (context_): Promise<void> => {
              const secrets: Secret[] = await this.k8Factory
                .getK8(context_.config.clusterContext)
                .secrets()
                .list(context_.config.namespace, ['app.kubernetes.io/instance=solo-shared-resources']);
              const secret: Secret = secrets.find(
                (secret: Secret): boolean => secret.name === 'solo-shared-resources-redis',
              );

              // Update values
              context_.config.valuesArg += helpers.populateHelmArguments({
                'redis.enabled': false,
                'redis.auth.password': Base64.decode(secret.data['SPRING_DATA_REDIS_PASSWORD']),
                'redis.host': Base64.decode(secret.data['SPRING_DATA_REDIS_HOST']),
                'redis.port': Base64.decode(secret.data['SPRING_DATA_REDIS_PORT']),
              });
            },
          },
          {
            title: 'Initialize Postgres pod',
            task: (context_, task): SoloListr<MirrorNodeDeployContext> => {
              const subTasks: SoloListrTask<MirrorNodeDeployContext>[] = [
                {
                  title: 'Wait for Postgres pod to be ready',
                  task: async (context_): Promise<void> => {
                    await this.postgresSharedResource.waitForPodReady(
                      context_.config.namespace,
                      context_.config.clusterContext,
                    );
                  },
                },
              ];

              // set up the sub-tasks
              return task.newListr(subTasks, {
                concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
                rendererOptions: {
                  collapseSubtasks: false,
                },
              });
            },
            skip: (context_): boolean => context_.config.useExternalDatabase,
          },
          {
            title: 'Add shared resource components to remote config',
            skip: (context_): boolean => !context_.config.installSharedResources || !this.remoteConfig.isLoaded(),
            task: async (context_): Promise<void> => {
              if (!context_.config.useExternalDatabase) {
                const postgresComponent: PostgresStateSchema = this.componentFactory.createNewPostgresComponent(
                  context_.config.clusterReference,
                  context_.config.namespace,
                );
                this.remoteConfig.configuration.components.addNewComponent(postgresComponent, ComponentTypes.Postgres);
              }
              const redisComponent: RedisStateSchema = this.componentFactory.createNewRedisComponent(
                context_.config.clusterReference,
                context_.config.namespace,
              );
              this.remoteConfig.configuration.components.addNewComponent(redisComponent, ComponentTypes.Redis);
              await this.remoteConfig.persist();
            },
          },
        ];

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

  private initializeSharedPostgresDatabaseTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Run database initialization script',
      task: async (context_): Promise<void> => {
        await this.postgresSharedResource.initializeMirrorNode(
          context_.config.namespace,
          context_.config.clusterContext,
          this.getEnvironmentVariablePrefix(context_.config.mirrorNodeVersion),
        );
      },
      skip: ({config}: MirrorNodeDeployContext): boolean =>
        config.useExternalDatabase || !config.installSharedResources,
    };
  }

  /**
   * Installs the mirror chart with all application components disabled in order to create the
   * `mirror-passwords` secret.  The init script (run by {@link initializeSharedPostgresDatabaseTask})
   * reads that secret to obtain the DB user passwords, so the secret must exist before init runs.
   * The importer must not be running during init (it would hold a session that blocks DROP DATABASE),
   * so we use this lightweight prime install instead of a full chart install.
   *
   * Skipped when the secret already exists (upgrade path) or when using an external database.
   */
  /**
   * Deletes the `<release>-redis` secret so that the subsequent mirror chart install/upgrade
   * re-creates it cleanly.  This is necessary because Kubernetes strategic-merge-patch does not
   * remove keys — stale `SPRING_DATA_REDIS_SENTINEL_NODES` values written by a previous install
   * (using the internal chart-managed Redis) would otherwise persist and cause pods to try to
   * resolve a non-existent hostname.
   */
  private deleteStaleRedisSecretTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Delete stale mirror redis secret',
      task: async (context_): Promise<void> => {
        // secrets().delete() returns true for NotFound, so no try/catch needed.
        await this.k8Factory
          .getK8(context_.config.clusterContext)
          .secrets()
          .delete(context_.config.namespace, `${context_.config.releaseName}-redis`);
      },
    };
  }

  private primePostgresSecretTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prime mirror-node postgres secret',
      task: async (context_): Promise<void> => {
        // Skip if the secret was already created by a previous install.
        const secretExists: boolean = await this.k8Factory
          .getK8(context_.config.clusterContext)
          .secrets()
          .exists(context_.config.namespace, 'mirror-passwords');
        if (secretExists) {
          return;
        }

        // Install the mirror chart with every application component disabled.  This is enough for
        // Helm to render and apply the `mirror-passwords` Secret template without starting any pods
        // that could connect to Postgres before the init script runs.
        //
        // redis.enabled must be false here: when true the chart writes SPRING_DATA_REDIS_SENTINEL_NODES
        // into the <release>-redis secret using the chart default host ({{ .Release.Name }}-redis).
        // Kubernetes strategic-merge-patch does not remove keys, so those stale sentinel values would
        // persist through the full upgrade (which sets redis.enabled=false and skips the sentinel block).
        // Setting redis.enabled=false in the prime install prevents the stale keys from ever being written.
        const primeValuesArgument: string =
          ' --install' +
          helpers.populateHelmArguments({
            'stackgres.enabled': false,
            'postgresql.enabled': false,
            'redis.enabled': false,
            'db.host': `solo-shared-resources-postgres.${context_.config.namespace.name}.svc.cluster.local`,
            'db.name': 'mirror_node',
            'importer.enabled': false,
            'grpc.enabled': false,
            'rest.enabled': false,
            'restjava.enabled': false,
            'web3.enabled': false,
            'rosetta.enabled': false,
            'graphql.enabled': false,
            'monitor.enabled': false,
          });

        await this.chartManager.upgrade(
          context_.config.namespace,
          context_.config.releaseName,
          constants.MIRROR_NODE_CHART,
          context_.config.mirrorNodeChartDirectory || constants.MIRROR_NODE_RELEASE_NAME,
          context_.config.mirrorNodeVersion,
          primeValuesArgument,
          context_.config.clusterContext,
          false,
        );
      },
      skip: ({config}: MirrorNodeDeployContext): boolean =>
        config.useExternalDatabase || !config.installSharedResources,
    };
  }

  private enableMirrorNodeTask(commandType: MirrorNodeCommandType): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable mirror-node',
      task: (_, parentTask): SoloListr<AnyListrContext> =>
        parentTask.newListr<MirrorNodeDeployContext>(
          [
            {
              title: 'Prepare address book',
              task: async (context_): Promise<void> => {
                if (this.oneShotState.isActive()) {
                  context_.addressBook = await this.accountManager.buildAddressBookBase64(
                    PathEx.join(context_.config.cacheDir, 'keys'),
                    context_.config.deployment,
                  );

                  context_.config.valuesArg += ` --set "importer.addressBook=${context_.addressBook}"`;
                } else {
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
                }
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
                await this.adoptMirrorIngressControllerRbacOwnership(config);
                showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);
              },
              skip: (context_): boolean => !context_.config.enableIngress,
            },
            {
              title: 'Deploy mirror-node',
              task: async (context_): Promise<void> => {
                await this.deployMirrorNode(context_, commandType);
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
      task: async (context_, task): Promise<SoloListr<MirrorNodeDeployContext | MirrorNodeUpgradeContext>> => {
        const instanceCandidates: string[] = [
          this.renderReleaseName(context_.config.id), // e.g. mirror-1
          context_.config.releaseName,
        ];
        if (context_.config.id === 1) {
          instanceCandidates.push(constants.MIRROR_NODE_RELEASE_NAME); // legacy release name
        }

        const podsInAllNamespaces: Pod[] = [];
        for (const instanceName of new Set(instanceCandidates)) {
          const candidatePods: Pod[] = await this.k8Factory
            .getK8(context_.config.clusterContext)
            .pods()
            .listForAllNamespaces([`app.kubernetes.io/instance=${instanceName}`]);
          podsInAllNamespaces.push(...candidatePods);
        }

        const podsClient: Pods = this.k8Factory.getK8(context_.config.clusterContext).pods();
        const namespacePodReferences: PodReference[] = [
          ...new Map(
            podsInAllNamespaces
              .filter((pod): boolean => pod.podReference?.namespace?.name === context_.config.namespace.name)
              .map((pod): [string, PodReference] => [
                `${pod.podReference.namespace.name}/${pod.podReference.name.name}`,
                pod.podReference,
              ]),
          ).values(),
        ];
        const namespacePods: Pod[] = await Promise.all(
          namespacePodReferences.map(
            async (podReference: PodReference): Promise<Pod> => await podsClient.read(podReference),
          ),
        );

        const deployedPods: Pod[] = namespacePods.filter(
          (pod): boolean => !!pod.labels?.['app.kubernetes.io/component'] && !!pod.labels?.['app.kubernetes.io/name'],
        );

        if (deployedPods.length === 0) {
          throw new SoloError(
            `No deployed mirror-node pods found for release ${context_.config.releaseName} in namespace ${context_.config.namespace.name}`,
          );
        }

        const checksBySelector: Map<string, {title: string; labels: string[]}> = new Map();
        for (const pod of deployedPods) {
          const component: string = pod.labels?.['app.kubernetes.io/component'];
          const name: string = pod.labels?.['app.kubernetes.io/name'];
          const key: string = `${component}|${name}`;
          if (!checksBySelector.has(key)) {
            const titleName: string = component
              .split('-')
              .map((word: string): string => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            checksBySelector.set(key, {
              title: `Check ${titleName}`,
              labels: [
                `app.kubernetes.io/component=${component}`,
                `app.kubernetes.io/name=${name}`,
                `app.kubernetes.io/instance=${pod.labels?.['app.kubernetes.io/instance']}`,
              ],
            });
          }
        }

        const subTasks: SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext>[] = [
          ...checksBySelector.values(),
        ].map(
          ({
            title,
            labels,
          }: {
            title: string;
            labels: string[];
          }): SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext> => ({
            title,
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
          }),
        );

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for mirror ingress controller',
      skip: ({config}: MirrorNodeDeployContext): boolean => !config.forcePortForward || !config.enableIngress,
      task: async ({config}: MirrorNodeDeployContext): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
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
          undefined,
          true, // persist: auto-restart on failure using persist-port-forward.js
          externalAddress,
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
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
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

            const hasMirrorNodeMemoryImprovements: boolean = new SemanticVersion<string>(
              config.mirrorNodeVersion,
            ).greaterThanOrEqual(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION);

            config.namespace = await this.getNamespace(task);
            config.clusterReference = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterReference);

            config.newMirrorNodeComponent = this.componentFactory.createNewMirrorNodeComponent(
              config.clusterReference,
              config.namespace,
            );

            config.newMirrorNodeComponent.metadata.phase = DeploymentPhase.REQUESTED;

            config.id = config.newMirrorNodeComponent.metadata.id;
            config.installSharedResources = false;

            const useMirrorNodeLegacyReleaseName: boolean = process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME === 'true';
            if (useMirrorNodeLegacyReleaseName) {
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

            context_.config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
              context_.config.soloChartVersion,
              false,
              'Solo chart version',
            );

            // predefined values first
            config.valuesArg = helpers.prepareValuesFiles(
              new SemanticVersion<string>(config.mirrorNodeVersion).lessThan(
                versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION,
              )
                ? constants.MIRROR_NODE_VALUES_FILE_HEDERA
                : constants.MIRROR_NODE_VALUES_FILE,
            );

            // user defined values later to override predefined values
            config.valuesArg += await this.prepareValuesArg(config);

            config.deployment = this.configManager.getFlag(flags.deployment);

            const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
            const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);
            const chartNamespace: string = this.getChartNamespace(config.mirrorNodeVersion);

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restjava', 'graphql', 'rosetta', 'web3'];

            for (const module of modules) {
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.realm=${realm}`;
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.shard=${shard}`;
            }

            if (config.pinger) {
              if (!hasMirrorNodeMemoryImprovements) {
                config.valuesArg += ' --set pinger.enabled=false';
                config.valuesArg += ' --set monitor.enabled=true';
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=${constants.MIRROR_NODE_PINGER_TPS}`;
              }

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(config.deployment).toString();
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.accountId=${operatorId}`;
              config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_ID=${operatorId}`;

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${config.operatorKey}`;
                config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${config.operatorKey}`;
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
                    config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${constants.OPERATOR_KEY}`;
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                    config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${operatorKeyFromK8}`;
                  }
                } catch (error) {
                  throw new SoloError(`Error getting operator key: ${error.message}`, error);
                }
              }
            } else {
              context_.config.valuesArg += ' --set monitor.enabled=false';
              context_.config.valuesArg += ' --set pinger.enabled=false';
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
              this.validateExternalDatabaseFlags(config);
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            this.addMirrorNodeMemoryOverrides(hasMirrorNodeMemoryImprovements, config);

            const lockTask: SoloListr<AnyListrContext> = this.oneShotState.isActive()
              ? ListrLock.newSkippedLockTask(task)
              : ListrLock.newAcquireLockTask(lease, task);

            return lockTask;
          },
        },
        this.addMirrorNodeComponents(),
        {
          title: 'load node client',
          task: async ({config}): Promise<void> => {
            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
          skip: this.oneShotState.isActive(),
        },
        {
          title: 'Deploy charts',
          task: (_, parentTask): SoloListr<AnyListrContext> => {
            const subTasks: SoloListrTask<MirrorNodeDeployContext>[] = [
              this.enableSharedResourcesTask(),
              this.primePostgresSecretTask(), // creates mirror-passwords secret before init reads it
              this.deleteStaleRedisSecretTask(), // remove stale sentinel nodes left by a prior prime install
              this.initializeSharedPostgresDatabaseTask(), // must run before mirror chart so importer doesn't hold a session during DB creation
              this.enableMirrorNodeTask(MirrorNodeCommandType.ADD),
            ];

            return parentTask.newListr(subTasks, {
              concurrent: false, // shared resources must be configured and DB initialized before mirror chart is installed
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        this.checkPodsAreReadyNodeTask(),
        this.enablePortForwardingTask(),
        {
          title: 'Show user messages',
          skip: (): boolean => this.oneShotState.isActive(),
          task: (): void => {
            this.logger.showAllMessageGroups();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
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
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
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
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
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

            const hasMirrorNodeMemoryImprovements: boolean = new SemanticVersion<string>(
              config.mirrorNodeVersion,
            ).greaterThanOrEqual(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION);

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
            config.installSharedResources = false;

            assertUpgradeVersionNotOlder(
              'Mirror node',
              config.mirrorNodeVersion,
              this.remoteConfig.getComponentVersion(ComponentTypes.MirrorNode),
              optionFromFlag(flags.mirrorNodeVersion),
            );

            context_.config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
              context_.config.soloChartVersion,
              false,
              'Solo chart version',
            );

            const useMirrorNodeLegacyReleaseName: boolean = process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME === 'true';
            if (useMirrorNodeLegacyReleaseName) {
              config.releaseName = constants.MIRROR_NODE_RELEASE_NAME;
              config.ingressReleaseName = constants.INGRESS_CONTROLLER_RELEASE_NAME;
            }

            // predefined values first
            config.valuesArg = new SemanticVersion<string>(config.mirrorNodeVersion).lessThan(
              versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION,
            )
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

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restjava', 'graphql', 'rosetta', 'web3'];
            for (const module of modules) {
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.realm=${realm}`;
              config.valuesArg += ` --set ${module}.config.${chartNamespace}.mirror.common.shard=${shard}`;
            }

            if (config.pinger) {
              if (!hasMirrorNodeMemoryImprovements) {
                config.valuesArg += ' --set pinger.enabled=false';
                config.valuesArg += ' --set monitor.enabled=true';
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps=5`;
              }

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(deploymentName).toString();
              config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.accountId=${operatorId}`;
              config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_ID=${operatorId}`;

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${config.operatorKey}`;
                config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${config.operatorKey}`;
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
                    config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${constants.OPERATOR_KEY}`;
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.valuesArg += ` --set monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                    config.valuesArg += ` --set pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY=${operatorKeyFromK8}`;
                  }
                } catch (error) {
                  throw new SoloError(`Error getting operator key: ${error.message}`, error);
                }
              }
            } else {
              context_.config.valuesArg += ' --set monitor.enabled=false';
              context_.config.valuesArg += ' --set pinger.enabled=false';
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
              this.validateExternalDatabaseFlags(config);
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            this.addMirrorNodeMemoryOverrides(hasMirrorNodeMemoryImprovements, config);

            const lockTask: SoloListr<AnyListrContext> = this.oneShotState.isActive()
              ? ListrLock.newSkippedLockTask(task)
              : ListrLock.newAcquireLockTask(lease, task);

            return lockTask;
          },
        },
        this.enableSharedResourcesTask(),
        this.deleteStaleRedisSecretTask(),
        this.primePostgresSecretTask(), // creates mirror-passwords secret if missing (e.g. re-install via upgrade)
        this.initializeSharedPostgresDatabaseTask(), // must run before mirror chart so importer doesn't hold a session during DB creation
        this.enableMirrorNodeTask(MirrorNodeCommandType.UPGRADE),
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
        if (!this.oneShotState.isActive()) {
          await lease.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease.release();
        }
        await this.accountManager.close();
      });
    }

    return true;
  }
  // Override values for mirror node memory optimizations
  private addMirrorNodeMemoryOverrides(
    hasMirrorNodeMemoryImprovements: boolean,
    config: MirrorNodeUpgradeConfigClass,
  ): void {
    const improvedMemoryModules: string[] = ['grpc', 'importer', 'rest', 'rest-java', 'web3'];
    if (!hasMirrorNodeMemoryImprovements) {
      for (const module of improvedMemoryModules) {
        const configRoot: string = module.replaceAll('-', '');
        config.valuesArg += ` --set ${configRoot}.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`;
        config.valuesArg += ` --set ${configRoot}.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}${module}`;

        const memoryKey: keyof typeof constants =
          `MIRROR_NODE_OLD_MEMORY_${configRoot.toUpperCase()}` as keyof typeof constants;
        config.valuesArg += ` --set ${configRoot}.resources.limits.memory=${constants[memoryKey]}`;
      }
    } else if (process.arch === 'arm64') {
      /** Unable to build linux/arm64 native images due to limitation in web3j.
       * Upstream ticket https://github.com/LFDT-web3j/web3j-sokt/issues/40
       * will need to be resolved before we can disable this logic
       */
      config.valuesArg += ` --set web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`;
      config.valuesArg += ` --set web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`;
      config.valuesArg += ` --set web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`;
    }
  }

  private validateExternalDatabaseFlags(config: MirrorNodeUpgradeConfigClass): void {
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
        `${errorMessage} ${missingFlags.map((flag: CommandFlag): string => `--${flag.name}`).join(', ')}`,
      );
    }
  }

  private getEnvironmentVariablePrefix(version: string): string {
    return new SemanticVersion<string>(version).lessThan(versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION)
      ? 'HEDERA'
      : 'HIERO';
  }

  private getChartNamespace(version: string): string {
    return new SemanticVersion<string>(version).lessThan(versions.POST_HIERO_MIGRATION_MIRROR_NODE_VERSION)
      ? 'hedera'
      : 'hiero';
  }

  /**
   * Encodes a shard.realm.num entity ID into the integer form used by the mirror node database.
   * Matches the encoding in EntityId.java: |10-bit shard|16-bit realm|38-bit num|
   */
  private static encodeEntityId(shard: number, realm: number, entityNumber: number): string {
    if (shard === 0 && realm === 0) {
      return String(entityNumber);
    }
    const NUM_BITS: bigint = 38n;
    const REALM_BITS: bigint = 16n;
    const encoded: bigint =
      (BigInt(entityNumber) & ((1n << NUM_BITS) - 1n)) |
      ((BigInt(realm) & ((1n << REALM_BITS) - 1n)) << NUM_BITS) |
      (BigInt(shard) << (REALM_BITS + NUM_BITS));
    return encoded.toString();
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeDestroyContext> = this.taskList.newTaskList<MirrorNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
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

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
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
          title: 'Destroy shared resources',
          task: async (context_): Promise<void> => {
            await this.sharedResourceManager.uninstallChart(context_.config.namespace, context_.config.clusterContext);

            // Delete PVCs left behind by the shared resources chart (Postgres data volume)
            const pvcs: string[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pvcs()
              .list(context_.config.namespace, ['app.kubernetes.io/instance=solo-shared-resources']);

            for (const pvc of pvcs) {
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .pvcs()
                .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc)));
            }
          },
        },
        this.disableSharedResourceComponents(),
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
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await this.accountManager?.close().catch();
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
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

  /** Removes the Postgres and Redis components from remote config when shared resources are destroyed. */
  public disableSharedResourceComponents(): SoloListrTask<MirrorNodeDestroyContext> {
    return {
      title: 'Remove shared resource components from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (): Promise<void> => {
        const postgresComponents: PostgresStateSchema[] =
          this.remoteConfig.configuration.components.getComponentByType<PostgresStateSchema>(ComponentTypes.Postgres);
        for (const component of postgresComponents) {
          this.remoteConfig.configuration.components.removeComponent(component.metadata.id, ComponentTypes.Postgres);
        }

        const redisComponents: RedisStateSchema[] =
          this.remoteConfig.configuration.components.getComponentByType<RedisStateSchema>(ComponentTypes.Redis);
        for (const component of redisComponents) {
          this.remoteConfig.configuration.components.removeComponent(component.metadata.id, ComponentTypes.Redis);
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the mirror node components to remote config. */
  public addMirrorNodeComponents(): SoloListrTask<MirrorNodeDeployContext> {
    return {
      title: 'Add mirror node to remote config',
      skip: (context_): boolean => {
        return !this.remoteConfig.isLoaded() || context_.config.isChartInstalled || this.oneShotState.isActive();
      },
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          context_.config.newMirrorNodeComponent,
          ComponentTypes.MirrorNode,
        );

        // update mirror node version in remote config
        this.remoteConfig.updateComponentVersion(
          ComponentTypes.MirrorNode,
          new SemanticVersion<string>(context_.config.mirrorNodeVersion),
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

  private async inferDestroyData(namespace: NamespaceName, context: Context): Promise<InferredData> {
    const id: ComponentId = this.inferMirrorNodeId();

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);
    const ingressReleaseName: string = await this.inferInstalledIngressReleaseName(namespace, context, id);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: constants.MIRROR_NODE_RELEASE_NAME,
        isChartInstalled: true,
        ingressReleaseName,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      ingressReleaseName,
      isLegacyChartInstalled,
    };
  }

  private async inferInstalledIngressReleaseName(
    namespace: NamespaceName,
    context: Context,
    id: ComponentId,
  ): Promise<string> {
    const candidates: string[] = [
      this.renderIngressReleaseName(id),
      `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${namespace.name}`,
      constants.INGRESS_CONTROLLER_RELEASE_NAME,
    ];

    for (const releaseName of candidates) {
      if (await this.chartManager.isChartInstalled(namespace, releaseName, context)) {
        return releaseName;
      }
    }

    // Keep existing behavior as fallback when no ingress release is currently installed.
    return this.renderIngressReleaseName(id);
  }

  private async adoptMirrorIngressControllerRbacOwnership(config: MirrorNodeDeployConfigClass): Promise<void> {
    const rbac: Rbacs = this.k8Factory.getK8(config.clusterContext).rbac();
    const rbacNames: Set<string> = new Set([
      constants.MIRROR_INGRESS_CONTROLLER,
      `${constants.MIRROR_INGRESS_CONTROLLER}-${config.namespace.name}`,
    ]);

    for (const rbacName of rbacNames) {
      await rbac.setHelmOwnership(rbacName, config.ingressReleaseName, config.namespace.name);
    }
  }
}
