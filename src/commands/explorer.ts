// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as helpers from '../core/helpers.js';
import {prepareValuesFiles, showVersionBanner, sleep} from '../core/helpers.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  NamespaceNameAsString,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {KeyManager} from '../core/key-manager.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Lock} from '../core/lock/lock.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {CommandFlag, CommandFlags} from '../types/flag-types.js';
import {Templates} from '../core/templates.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {Version} from '../business/utils/version.js';
import {Duration} from '../core/time/duration.js';
import {ExplorerStateSchema} from '../data/schema/model/remote/state/explorer-state-schema.js';
import {K8} from '../integration/kube/k8.js';
import {SemVer} from 'semver';

interface ExplorerDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  explorerChartDirectory: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  enableExplorerTls: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  valuesArg: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  soloChartVersion: string;
  domainName: Optional<string>;
  releaseName: string;
  ingressReleaseName: string;
  newExplorerComponent: ExplorerStateSchema;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  isChartInstalled: boolean;
  isLegacyChartInstalled: false;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface ExplorerDeployContext {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

interface ExplorerUpgradeConfigClass {
  cacheDir: string;
  chartDirectory: string;
  explorerChartDirectory: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  enableExplorerTls: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  valuesArg: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  soloChartVersion: string;
  domainName: Optional<string>;
  releaseName: string;
  ingressReleaseName: string;
  forcePortForward: Optional<boolean>;
  id: ComponentId;
  isChartInstalled: boolean;
  isLegacyChartInstalled: boolean;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface ExplorerUpgradeContext {
  config: ExplorerUpgradeConfigClass;
  addressBook: string;
}

interface ExplorerDestroyContext {
  config: {
    clusterContext: string;
    clusterReference: ClusterReferenceName;
    namespace: NamespaceName;
    isChartInstalled: boolean;
    id: ComponentId;
    releaseName: string;
    ingressReleaseName: string;
    isLegacyChartInstalled: boolean;
  };
}

@injectable()
export class ExplorerCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.ClusterChecks) private readonly clusterChecks: ClusterChecks,
  ) {
    super();

    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.clusterChecks = patchInject(clusterChecks, InjectTokens.ClusterChecks, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.cacheDir,
      flags.chartDirectory,
      flags.explorerChartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.namespace,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.clusterRef,
      flags.cacheDir,
      flags.chartDirectory,
      flags.explorerChartDirectory,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.namespace,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,
      flags.id,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.devMode],
  };

  private async prepareHederaExplorerValuesArg(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesHederaExplorerChart(profileName);
    if (profileValuesFile) {
      valuesArgument += prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }

    if (config.enableIngress) {
      valuesArgument += ' --set ingress.enabled=true';
      valuesArgument += ` --set ingressClassName=${config.ingressReleaseName}`;
    }
    valuesArgument += ` --set fullnameOverride=${config.releaseName}-${config.namespace.name}`;

    valuesArgument += ` --set proxyPass./api="http://${config.mirrorNodeReleaseName}-rest.${config.mirrorNamespace}.svc.cluster.local" `;

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
      });

      if (config.tlsClusterIssuerType === 'self-signed') {
        // Create TLS secret for Explorer
        await KeyManager.createTlsSecret(
          this.k8Factory,
          config.namespace,
          config.domainName,
          config.cacheDir,
          constants.EXPLORER_INGRESS_TLS_SECRET_NAME,
        );

        if (config.enableIngress) {
          valuesArgument += ` --set ingress.tls[0].hosts[0]=${config.domainName}`;
        }
      }
    }
    return valuesArgument;
  }

  private async prepareCertManagerChartValuesArg(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<string> {
    const {tlsClusterIssuerType, namespace} = config;

    let valuesArgument: string = ' --install ';

    if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
      throw new Error(
        `Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`,
      );
    }

    if (!(await this.clusterChecks.isCertManagerInstalled())) {
      valuesArgument += ' --set cert-manager.installCRDs=true';
    }

    if (tlsClusterIssuerType === 'self-signed') {
      valuesArgument += ' --set selfSignedClusterIssuer.enabled=true';
    } else {
      valuesArgument += ` --set global.explorerNamespace=${namespace}`;
      valuesArgument += ' --set acmeClusterIssuer.enabled=true';
      valuesArgument += ` --set certClusterIssuerType=${tlsClusterIssuerType}`;
    }
    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }
    return valuesArgument;
  }

  private async prepareValuesArg(config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass): Promise<string> {
    let valuesArgument: string = '';
    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }
    return valuesArgument;
  }

  private installCertManagerTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install cert manager',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableExplorerTls,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        config.soloChartVersion = Version.getValidSemanticVersion(config.soloChartVersion, false, 'Solo chart version');

        const {soloChartVersion} = config;

        const soloCertManagerValuesArgument: string = await this.prepareCertManagerChartValuesArg(config);
        // check if CRDs of cert-manager are already installed
        let needInstall: boolean = false;
        for (const crd of constants.CERT_MANAGER_CRDS) {
          const crdExists: boolean = await this.k8Factory.getK8(config.clusterContext).crds().ifExists(crd);

          if (!crdExists) {
            needInstall = true;
            break;
          }
        }

        if (needInstall) {
          // if cert-manager isn't already installed we want to install it separate from the certificate issuers
          // as they will fail to be created due to the order of the installation being dependent on the cert-manager
          // being installed first
          await this.chartManager.upgrade(
            NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
            constants.SOLO_CERT_MANAGER_CHART,
            constants.SOLO_CERT_MANAGER_CHART,
            config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
            soloChartVersion,
            ' --install --create-namespace --set cert-manager.installCRDs=true',
            config.clusterContext,
          );
          showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion);
        }

        // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            constants.DEFAULT_CERT_MANAGER_NAMESPACE,
            ['app.kubernetes.io/component=webhook', `app.kubernetes.io/instance=${constants.SOLO_CERT_MANAGER_CHART}`],
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );

        // sleep for a few seconds to allow cert-manager to be ready
        await sleep(Duration.ofSeconds(10));

        await this.chartManager.upgrade(
          NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
          constants.SOLO_CERT_MANAGER_CHART,
          constants.SOLO_CERT_MANAGER_CHART,
          config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
          soloChartVersion,
          soloCertManagerValuesArgument,
          config.clusterContext,
        );
        showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion, 'Upgraded');
      },
    };
  }

  private installExplorerTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install explorer',
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        let exploreValuesArgument: string = ' --install ';
        exploreValuesArgument += prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
        exploreValuesArgument += await this.prepareHederaExplorerValuesArg(config);

        config.explorerVersion = Version.getValidSemanticVersion(config.explorerVersion, false, 'Explorer version');

        await this.chartManager.upgrade(
          config.namespace,
          config.releaseName,
          '',
          config.explorerChartDirectory || constants.EXPLORER_CHART_URL,
          config.explorerVersion,
          exploreValuesArgument,
          config.clusterContext,
        );
        showVersionBanner(this.logger, config.releaseName, config.explorerVersion);
      },
    };
  }

  private installExplorerIngressControllerTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install explorer ingress controller',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableIngress,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        let explorerIngressControllerValuesArgument: string = ' --install ';

        if (config.explorerStaticIp !== '') {
          explorerIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${config.explorerStaticIp}`;
        }
        explorerIngressControllerValuesArgument += ` --set fullnameOverride=${config.ingressReleaseName}`;
        explorerIngressControllerValuesArgument += ` --set controller.ingressClass=${config.ingressReleaseName}`;
        explorerIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${config.ingressReleaseName}`;
        if (config.tlsClusterIssuerType === 'self-signed') {
          explorerIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);
        }

        await this.chartManager.upgrade(
          config.namespace,
          config.ingressReleaseName,
          constants.INGRESS_CONTROLLER_RELEASE_NAME,
          constants.INGRESS_CONTROLLER_RELEASE_NAME,
          INGRESS_CONTROLLER_VERSION,
          explorerIngressControllerValuesArgument,
          config.clusterContext,
        );

        showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);

        const k8: K8 = this.k8Factory.getK8(config.clusterContext);

        // patch explorer ingress to use h1 protocol, haproxy ingress controller default backend protocol is h2
        // to support grpc over http/2
        await k8.ingresses().update(config.namespace, config.releaseName, {
          metadata: {
            annotations: {
              'haproxy-ingress.github.io/backend-protocol': 'h1',
            },
          },
        });

        const ingressClasses: IngressClass[] = await k8.ingressClasses().list();
        if (ingressClasses.some((ingressClass): boolean => ingressClass.name === config.ingressReleaseName)) {
          return;
        }

        await k8
          .ingressClasses()
          .create(config.ingressReleaseName, constants.INGRESS_CONTROLLER_PREFIX + config.ingressReleaseName);
      },
    };
  }

  private checkExplorerPodIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check explorer pod is ready',
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            config.namespace,
            Templates.renderExplorerLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );
      },
    };
  }

  private checkExplorerIngressControllerPodIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check haproxy ingress controller pod is ready',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableIngress,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            config.namespace,
            [
              `app.kubernetes.io/name=${constants.INGRESS_CONTROLLER_RELEASE_NAME}`,
              `app.kubernetes.io/instance=${config.ingressReleaseName}`,
            ],
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );
      },
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for explorer',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.forcePortForward,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        const pods: Pod[] = await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .list(
            config.namespace,
            Templates.renderExplorerLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
          );

        if (pods.length === 0) {
          throw new SoloError('No Hiero Explorer pod found');
        }

        const podReference: PodReference = pods[0].podReference;

        await this.remoteConfig.configuration.components.stopPortForwards(
          config.clusterRef,
          podReference,
          constants.EXPLORER_PORT, // Pod port
          constants.EXPLORER_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.Explorer,
          'Explorer',
        );
        await this.remoteConfig.persist();

        await this.remoteConfig.configuration.components.managePortForward(
          config.clusterRef,
          podReference,
          constants.EXPLORER_PORT, // Pod port
          constants.EXPLORER_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.Explorer,
          'Explorer',
          config.isChartInstalled, // Reuse existing port if chart is already installed
        );
        await this.remoteConfig.persist();
      },
    };
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
    );
  }

  private getIngressReleaseName(namespaceName: NamespaceName): string {
    return this.renderIngressReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
      namespaceName,
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  private renderIngressReleaseName(id: ComponentId, namespaceName: NamespaceName): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}-${namespaceName.name}`;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDeployContext> = this.taskList.newTaskList<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional,
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: ExplorerDeployConfigClass = this.configManager.getConfig(
              ExplorerCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
              [],
            ) as ExplorerDeployConfigClass;

            config.isLegacyChartInstalled = false;

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterRef);

            config.releaseName = this.getReleaseName();
            config.ingressReleaseName = this.getIngressReleaseName(config.namespace);

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.clusterContext,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            config.newExplorerComponent = this.componentFactory.createNewExplorerComponent(
              config.clusterRef,
              config.namespace,
            );

            config.id = config.newExplorerComponent.metadata.id;

            config.valuesArg = await this.prepareValuesArg(context_.config);

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        this.loadRemoteConfigTask(argv),
        this.installCertManagerTask(),
        this.installExplorerTask(),
        this.installExplorerIngressControllerTask(),
        this.checkExplorerPodIsReadyTask(),
        this.checkExplorerIngressControllerPodIsReadyTask(),
        this.addExplorerComponents(),
        this.enablePortForwardingTask(),
        // TODO only show this if we are not running in one-shot mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer deployment has completed');
      } catch (error) {
        throw new SoloError(`Error deploying explorer: ${error.message}`, error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerUpgradeContext> = this.taskList.newTaskList<ExplorerUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.optional,
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: ExplorerUpgradeConfigClass = this.configManager.getConfig(
              ExplorerCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
              [],
            ) as ExplorerUpgradeConfigClass;

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterRef);

            const {id, releaseName, ingressReleaseName, isChartInstalled, isLegacyChartInstalled} =
              await this.inferExplorerData(config.namespace, config.clusterContext);

            config.id = id;
            config.releaseName = releaseName;
            config.ingressReleaseName = ingressReleaseName;
            config.isChartInstalled = isChartInstalled;
            config.isLegacyChartInstalled = isLegacyChartInstalled;

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.clusterContext,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            config.valuesArg = await this.prepareValuesArg(context_.config);

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        this.loadRemoteConfigTask(argv),
        this.installCertManagerTask(),
        this.installExplorerTask(),
        this.installExplorerIngressControllerTask(),
        this.checkExplorerPodIsReadyTask(),
        this.checkExplorerIngressControllerPodIsReadyTask(),
        this.enablePortForwardingTask(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer upgrading has completed');
      } catch (error) {
        throw new SoloError(`Error upgrading explorer: ${error.message}`, error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDestroyContext> = this.taskList.newTaskList<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the explorer?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);

            const namespace: NamespaceName = await this.getNamespace(task);
            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const clusterContext: Context = this.getClusterContext(clusterReference);

            const {id, releaseName, ingressReleaseName, isChartInstalled, isLegacyChartInstalled} =
              await this.inferExplorerData(namespace, clusterContext);

            context_.config = {
              namespace,
              clusterContext,
              clusterReference,
              id,
              releaseName,
              ingressReleaseName,
              isChartInstalled,
              isLegacyChartInstalled,
            };

            await this.throwIfNamespaceIsMissing(clusterContext, namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        this.loadRemoteConfigTask(argv),
        {
          title: 'Destroy explorer',
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
          title: 'Uninstall explorer ingress controller',
          task: async (context_): Promise<void> => {
            await this.chartManager.uninstall(context_.config.namespace, context_.config.ingressReleaseName);
            // destroy ingress class if found one
            const existingIngressClasses: IngressClass[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map((ingressClass: IngressClass): void => {
              if (ingressClass.name === context_.config.ingressReleaseName) {
                this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(context_.config.ingressReleaseName);
              }
            });
          },
        },
        this.disableMirrorNodeExplorerComponents(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error destroy explorer: ${error.message}`, error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  private loadRemoteConfigTask(argv: ArgvStruct): SoloListrTask<AnyListrContext> {
    return {
      title: 'Load remote config',
      task: async (): Promise<void> => {
        await this.remoteConfig.loadAndValidate(argv);
      },
    };
  }

  /** Removes the explorer components from remote config. */
  private disableMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDestroyContext> {
    return {
      title: 'Remove explorer from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.Explorer);

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the explorer components to remote config. */
  private addExplorerComponents(): SoloListrTask<ExplorerDeployContext> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          config.newExplorerComponent,
          ComponentTypes.Explorer,
        );
        // update explorer version in remote config
        this.remoteConfig.updateComponentVersion(ComponentTypes.Explorer, new SemVer(config.explorerVersion));
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
    return id <= 1
      ? await this.chartManager.isChartInstalled(namespace, constants.EXPLORER_RELEASE_NAME, context)
      : false;
  }

  private inferExplorerId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);

    if (typeof id === 'number') {
      return id;
    }

    if (!this.remoteConfig.configuration.components.state.explorers[0]) {
      throw new SoloError('No explorer component found in remote config');
    }

    return this.remoteConfig.configuration.components.state.explorers[0].metadata.id;
  }

  private async inferExplorerData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    id: ComponentId;
    releaseName: string;
    ingressReleaseName: string;
    isChartInstalled: boolean;
    isLegacyChartInstalled: boolean;
  }> {
    const id: ComponentId = this.inferExplorerId();

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: constants.EXPLORER_RELEASE_NAME,
        isChartInstalled: true,
        ingressReleaseName: constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      ingressReleaseName: this.renderIngressReleaseName(id, namespace),
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
