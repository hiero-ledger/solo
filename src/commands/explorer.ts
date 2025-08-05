// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {
  EXPLORER_INGRESS_CONTROLLER,
  EXPLORER_INGRESS_TLS_SECRET_NAME,
  EXPLORER_CHART_URL,
  INGRESS_CONTROLLER_PREFIX,
} from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as helpers from '../core/helpers.js';
import {prepareValuesFiles, showVersionBanner, sleep} from '../core/helpers.js';
import {
  type ClusterReferenceName,
  type CommandDefinition,
  type Context,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {KeyManager} from '../core/key-manager.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {type MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {Lock} from '../core/lock/lock.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {Version} from '../business/utils/version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {Duration} from '../core/time/duration.js';

interface ExplorerDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  enableExplorerTls: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  mirrorNamespace: NamespaceName;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  valuesArg: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  domainName: Optional<string>;
  forcePortForward: Optional<boolean>;
  soloChartVersion: string;
}

interface ExplorerDeployContext {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

interface ExplorerDestroyContext {
  config: {
    clusterContext: string;
    clusterReference: ClusterReferenceName;
    namespace: NamespaceName;
    isChartInstalled: boolean;
  };
}

interface ExplorerUpgradeConfigClass {
  cacheDir: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  mirrorNamespace: NamespaceName;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  clusterSetupNamespace: NamespaceName;
  valuesFile: string;
  valuesArg: string;
  forcePortForward: Optional<boolean>;
  domainName: string;
}

interface ExplorerUpgradeContext {
  config: ExplorerUpgradeConfigClass;
}

@injectable()
export class ExplorerCommand extends BaseCommand {
  public static readonly DEPLOY_COMMAND = 'explorer deploy';

  public constructor(
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.ClusterChecks) private readonly clusterChecks: ClusterChecks,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
  ) {
    super();

    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.clusterChecks = patchInject(clusterChecks, InjectTokens.ClusterChecks, this.constructor.name);
  }

  public static readonly COMMAND_NAME: string = 'explorer';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.chartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.mirrorNamespace,
      flags.namespace,
      flags.deployment,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,
    ],
  };

  private static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.mirrorNamespace,
      flags.namespace,
      flags.deployment,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,
    ],
  };

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.deployment],
  };

  private async prepareHederaExplorerValuesArg(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile: string = await this.profileManager.prepareValuesHederaExplorerChart(profileName);
    if (profileValuesFile) {
      valuesArgument += prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }

    if (config.enableIngress) {
      valuesArgument += ' --set ingress.enabled=true';
      valuesArgument += ` --set ingressClassName=${constants.EXPLORER_INGRESS_CLASS_NAME}`;
    }
    valuesArgument += ` --set fullnameOverride=${constants.EXPLORER_RELEASE_NAME}`;

    if (config.mirrorNamespace) {
      // use fully qualified service name for mirror node since the explorer is in a different namespace
      valuesArgument += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest.${config.mirrorNamespace}.svc.cluster.local" `;
    } else {
      valuesArgument += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest" `;
    }

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
          EXPLORER_INGRESS_TLS_SECRET_NAME,
        );

        if (config.enableIngress) {
          valuesArgument += ` --set ingress.tls[0].hosts[0]=${config.domainName}`;
        }
      }
    }
    return valuesArgument;
  }

  private async prepareCertManagerChartValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
    const {tlsClusterIssuerType, namespace} = config;

    let valuesArgument = '';

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

  private async prepareExplorerIngressControllerArg(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<string> {
    let explorerIngressControllerValuesArgument: string = '';

    if (config.explorerStaticIp !== '') {
      explorerIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${config.explorerStaticIp}`;
    }
    explorerIngressControllerValuesArgument += ` --set fullnameOverride=${EXPLORER_INGRESS_CONTROLLER}`;
    explorerIngressControllerValuesArgument += ` --set controller.ingressClass=${constants.EXPLORER_INGRESS_CLASS_NAME}`;
    explorerIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${constants.EXPLORER_INGRESS_CONTROLLER}`;

    if (config.tlsClusterIssuerType === 'self-signed') {
      explorerIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);
    }

    return explorerIngressControllerValuesArgument;
  }

  /**
   * patch explorer ingress to use h1 protocol,
   * haproxy ingress controller default backend protocol is h2
   * to support grpc over http/2
   */
  private async patchExplorerIngress(config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass): Promise<void> {
    await this.k8Factory
      .getK8(config.clusterContext)
      .ingresses()
      .update(config.namespace, constants.EXPLORER_RELEASE_NAME, {
        metadata: {
          annotations: {
            'haproxy-ingress.github.io/backend-protocol': 'h1',
          },
        },
      });
    await this.k8Factory
      .getK8(config.clusterContext)
      .ingressClasses()
      .create(constants.EXPLORER_INGRESS_CLASS_NAME, INGRESS_CONTROLLER_PREFIX + EXPLORER_INGRESS_CONTROLLER);
  }

  private enablePortForwardTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.forcePortForward,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        const pods: Pod[] = await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .list(config.namespace, ['app.kubernetes.io/instance=hiero-explorer']);
        if (pods.length === 0) {
          throw new SoloError('No Hiero Explorer pod found');
        }
        const podReference: PodReference = pods[0].podReference;

        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .readByReference(podReference)
          .portForward(constants.EXPLORER_PORT, constants.EXPLORER_PORT, true);
        this.logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
        this.logger.addMessageGroupMessage(
          constants.PORT_FORWARDING_MESSAGE_GROUP,
          `Explorer port forward enabled on http://localhost:${constants.EXPLORER_PORT}`,
        );
      },
    };
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    let lease: Lock;

    const tasks = this.taskList.newTaskList<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            self.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional,
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.required,
            ];

            await self.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              ExplorerCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
            ) as ExplorerDeployConfigClass;

            context_.config.valuesArg = '';
            context_.config.valuesArg += await self.prepareValuesArg(context_.config);

            context_.config.clusterContext = context_.config.clusterRef
              ? this.localConfig.configuration.clusterRefs.get(context_.config.clusterRef)?.toString()
              : this.k8Factory.default().contexts().readCurrent();

            if (
              !(await self.k8Factory.getK8(context_.config.clusterContext).namespaces().has(context_.config.namespace))
            ) {
              throw new SoloError(`namespace ${context_.config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.loadRemoteConfigTask(argv),
        {
          title: 'Install cert manager',
          task: async ({config}): Promise<void> => {
            config.soloChartVersion = Version.getValidSemanticVersion(
              config.soloChartVersion,
              false,
              'Solo chart version',
            );
            const {soloChartVersion} = config;

            const soloCertManagerValuesArgument: string = await self.prepareCertManagerChartValuesArg(config);
            // check if CRDs of cert-manager are already installed
            let needInstall: boolean = false;
            for (const crd of constants.CERT_MANAGER_CRDS) {
              const crdExists: boolean = await self.k8Factory.getK8(config.clusterContext).crds().ifExists(crd);
              if (!crdExists) {
                needInstall = true;
                break;
              }
            }

            if (needInstall) {
              // if cert-manager isn't already installed we want to install it separate from the certificate issuers
              // as they will fail to be created due to the order of the installation being dependent on the cert-manager
              // being installed first
              await self.chartManager.install(
                NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
                constants.SOLO_CERT_MANAGER_CHART,
                constants.SOLO_CERT_MANAGER_CHART,
                config.chartDirectory ? config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
                soloChartVersion,
                '  --set cert-manager.installCRDs=true',
                config.clusterContext,
              );
              showVersionBanner(self.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion);
            }

            // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
            await self.k8Factory
              .getK8(config.clusterContext)
              .pods()
              .waitForReadyStatus(
                constants.DEFAULT_CERT_MANAGER_NAMESPACE,
                [
                  'app.kubernetes.io/component=webhook',
                  `app.kubernetes.io/instance=${constants.SOLO_CERT_MANAGER_CHART}`,
                ],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );

            // sleep for a few seconds to allow cert-manager to be ready
            await sleep(Duration.ofSeconds(10));

            await self.chartManager.upgrade(
              NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
              constants.SOLO_CERT_MANAGER_CHART,
              constants.SOLO_CERT_MANAGER_CHART,
              config.chartDirectory ? config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
              soloChartVersion,
              soloCertManagerValuesArgument,
              config.clusterContext,
            );
            showVersionBanner(self.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion, 'Upgraded');
          },
          skip: ({config}): boolean => !config.enableExplorerTls,
        },
        {
          title: 'Install explorer',
          task: async ({config}): Promise<void> => {
            let exploreValuesArgument: string = prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
            exploreValuesArgument += await self.prepareHederaExplorerValuesArg(config);

            config.explorerVersion = Version.getValidSemanticVersion(config.explorerVersion, false, 'Explorer version');

            await self.chartManager.install(
              config.namespace,
              constants.EXPLORER_RELEASE_NAME,
              '',
              EXPLORER_CHART_URL,
              config.explorerVersion,
              exploreValuesArgument,
              config.clusterContext,
            );
            showVersionBanner(self.logger, constants.EXPLORER_RELEASE_NAME, config.explorerVersion);
          },
        },
        {
          title: 'Install explorer ingress controller',
          task: async ({config}) => {
            const explorerIngressControllerValuesArgument: string =
              await this.prepareExplorerIngressControllerArg(config);

            await self.chartManager.install(
              config.namespace,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
              explorerIngressControllerValuesArgument,
              config.clusterContext,
            );
            showVersionBanner(
              self.logger,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
            );

            await this.patchExplorerIngress(config);
          },
          skip: context_ => !context_.config.enableIngress,
        },
        {
          title: 'Check explorer pod is ready',
          task: async context_ => {
            await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                [constants.SOLO_EXPLORER_LABEL],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
        },
        {
          title: 'Check haproxy ingress controller pod is ready',
          task: async context_ => {
            await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                [
                  `app.kubernetes.io/name=${constants.INGRESS_CONTROLLER_RELEASE_NAME}`,
                  `app.kubernetes.io/instance=${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}`,
                ],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
          skip: context_ => !context_.config.enableIngress,
        },
        this.addMirrorNodeExplorerComponents(),
        this.enablePortForwardTask(),
        // TODO only show this if we are not running in quick-start mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      ExplorerCommand.DEPLOY_COMMAND,
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        self.logger.debug('explorer deployment has completed');
      } catch (error) {
        throw new SoloError(`Error deploying explorer: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
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
          task: async (context_: ExplorerUpgradeContext, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.optional,
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: ExplorerUpgradeConfigClass = this.configManager.getConfig(
              ExplorerCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
            ) as ExplorerUpgradeConfigClass;

            context_.config = config;

            config.valuesArg += await this.prepareValuesArg(config);

            config.clusterContext = config.clusterRef
              ? this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString()
              : this.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.clusterContext).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async ({config}): Promise<void> => {
            const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
              config.namespace,
              constants.EXPLORER_RELEASE_NAME,
              config.clusterContext,
            );

            if (!isChartInstalled) {
              throw new SoloError('Explorer node is not deployed');
            }
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.valuesArg = '';

            config.valuesArg += prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
            config.valuesArg += await this.prepareHederaExplorerValuesArg(config);

            config.explorerVersion = Version.getValidSemanticVersion(config.explorerVersion, false, 'Explorer version');
          },
        },
        {
          title: 'Upgrade explorer',
          task: async ({config}): Promise<void> => {
            await this.chartManager.upgrade(
              config.namespace,
              constants.EXPLORER_RELEASE_NAME,
              '',
              constants.EXPLORER_CHART_URL,
              config.explorerVersion,
              config.valuesArg,
              config.clusterContext,
            );

            showVersionBanner(this.logger, constants.EXPLORER_RELEASE_NAME, config.explorerVersion);
          },
        },
        {
          title: 'Handle explorer ingress controller',
          skip: ({config}): boolean => !config.enableIngress,
          task: async ({config}): Promise<void> => {
            const explorerIngressControllerValuesArgument: string =
              await this.prepareExplorerIngressControllerArg(config);

            const isIngressChartInstalled: boolean = await this.chartManager.isChartInstalled(
              config.namespace,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              config.clusterContext,
            );

            await (isIngressChartInstalled
              ? this.chartManager.upgrade(
                  config.namespace,
                  constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  INGRESS_CONTROLLER_VERSION,
                  explorerIngressControllerValuesArgument,
                  config.clusterContext,
                )
              : this.chartManager.install(
                  config.namespace,
                  constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  INGRESS_CONTROLLER_VERSION,
                  explorerIngressControllerValuesArgument,
                  config.clusterContext,
                ));

            showVersionBanner(
              this.logger,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
            );

            await this.patchExplorerIngress(config);
          },
        },
        {
          title: 'Check explorer pod is ready',
          task: async ({config}): Promise<void> => {
            await this.k8Factory
              .getK8(config.clusterContext)
              .pods()
              .waitForReadyStatus(
                config.namespace,
                [constants.SOLO_EXPLORER_LABEL],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
        },
        this.enablePortForwardTask(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      'explorer upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer upgrade has completed');
      } catch (error) {
        throw new SoloError(`Error upgrading explorer: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    let lease: Lock;

    const tasks = new Listr<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            if (!argv.force) {
              const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the explorer?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            const clusterReference: ClusterReferenceName = this.configManager.hasFlag(flags.clusterRef)
              ? this.configManager.getFlag(flags.clusterRef)
              : this.remoteConfig.currentCluster;

            const clusterContext: Context = this.localConfig.configuration.clusterRefs
              .get(clusterReference)
              ?.toString();

            context_.config = {
              namespace,
              clusterContext,
              clusterReference,
              isChartInstalled: await this.chartManager.isChartInstalled(
                namespace,
                constants.EXPLORER_RELEASE_NAME,
                clusterContext,
              ),
            };

            if (!(await self.k8Factory.getK8(context_.config.clusterContext).namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace.name} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.loadRemoteConfigTask(argv),
        {
          title: 'Destroy explorer',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.EXPLORER_RELEASE_NAME,
              context_.config.clusterContext,
            );
          },
          skip: context_ => !context_.config.isChartInstalled,
        },
        {
          title: 'Uninstall explorer ingress controller',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
            );
            // delete ingress class if found one
            const existingIngressClasses = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map(ingressClass => {
              if (ingressClass.name === constants.EXPLORER_INGRESS_CLASS_NAME) {
                this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(constants.EXPLORER_INGRESS_CLASS_NAME);
              }
            });
          },
        },
        this.disableMirrorNodeExplorerComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('explorer destruction has completed');
    } catch (error) {
      throw new SoloError(`Error destroy explorer: ${error.message}`, error);
    } finally {
      await lease?.release();
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: ExplorerCommand.COMMAND_NAME,
      desc: 'Manage Explorer in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy explorer',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running explorer deploy' ===");

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer deploy`====');
                  if (!r) {
                    throw new Error('Explorer deployment failed, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Explorer deployment failed: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'upgrade',
            desc: 'Upgrade explorer',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.UPGRADE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.UPGRADE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running explorer upgrade' ===");

              await self
                .upgrade(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer upgrade`====');
                  if (!r) {
                    throw new Error('Explorer upgrade failed, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Explorer upgrade failed: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy explorer',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info('==== Running explorer destroy ===');

              await self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer destroy ====');
                  if (!r) {
                    throw new SoloError('Explorer destruction failed, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Explorer destruction failed: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a explorer command');
      },
    };
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
      task: async (context_): Promise<void> => {
        const clusterReference: ClusterReferenceName = context_.config.clusterReference;

        const explorerComponents: MirrorNodeStateSchema[] =
          this.remoteConfig.configuration.components.getComponentsByClusterReference<MirrorNodeStateSchema>(
            ComponentTypes.Explorers,
            clusterReference,
          );

        for (const explorerComponent of explorerComponents) {
          this.remoteConfig.configuration.components.removeComponent(
            explorerComponent.metadata.id,
            ComponentTypes.Explorers,
          );
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the explorer components to remote config. */
  private addMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDeployContext> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const {namespace, clusterRef} = context_.config;

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewExplorerComponent(clusterRef, namespace),
          ComponentTypes.Explorers,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
