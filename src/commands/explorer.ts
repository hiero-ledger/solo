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
  soloChartVersion: string;
  domainName: Optional<string>;
  releaseName: string;
  ingressReleaseName: string;
  mirrorNodeId: ComponentId;
  isMirrorNodeLegacyChartInstalled: boolean;
  newExplorerComponent: ExplorerStateSchema;
  forcePortForward: Optional<boolean>;
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

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.clusterRef],
    optional: [
      flags.cacheDir,
      flags.chartDirectory,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.mirrorNamespace,
      flags.namespace,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.mirrorNodeId,
      flags.forcePortForward,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.devMode],
  };

  private async prepareHederaExplorerValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
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
    valuesArgument += ` --set fullnameOverride=${config.releaseName}`;
    const mirrorNodeReleaseName: string = `${constants.MIRROR_NODE_RELEASE_NAME}-${config.mirrorNodeId}`;

    valuesArgument += ` --set proxyPass./api="http://${mirrorNodeReleaseName}-rest.${config.mirrorNamespace}.svc.cluster.local" `;

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

  private async prepareCertManagerChartValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
    const {tlsClusterIssuerType, namespace} = config;

    let valuesArgument: string = '';

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

  private async prepareValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';
    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }
    return valuesArgument;
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
    );
  }

  private getIngressReleaseName(): string {
    return this.renderIngressReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  private renderIngressReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}`;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDeployContext> = this.taskList.newTaskList<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

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

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterRef);

            config.releaseName = this.getReleaseName();
            config.ingressReleaseName = this.getIngressReleaseName();
            this.inferMirrorNodeId(config);

            if (!config.mirrorNamespace) {
              config.mirrorNamespace = config.namespace;
            }

            config.newExplorerComponent = this.componentFactory.createNewExplorerComponent(
              config.clusterRef,
              config.namespace,
            );

            config.valuesArg = await this.prepareValuesArg(context_.config);
            config.valuesArg += await this.prepareValuesArg(config);

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.loadRemoteConfigTask(argv),
        {
          title: 'Install cert manager',
          task: async (context_): Promise<void> => {
            const config: ExplorerDeployConfigClass = context_.config;

            config.soloChartVersion = Version.getValidSemanticVersion(
              config.soloChartVersion,
              false,
              'Solo chart version',
            );

            const {soloChartVersion} = config;

            const soloCertManagerValuesArgument: string = await this.prepareCertManagerChartValuesArg(config);
            // check if CRDs of cert-manager are already installed
            let needInstall: boolean = false;
            for (const crd of constants.CERT_MANAGER_CRDS) {
              const crdExists: boolean = await this.k8Factory
                .getK8(context_.config.clusterContext)
                .crds()
                .ifExists(crd);

              if (!crdExists) {
                needInstall = true;
                break;
              }
            }

            if (needInstall) {
              // if cert-manager isn't already installed we want to install it separate from the certificate issuers
              // as they will fail to be created due to the order of the installation being dependent on the cert-manager
              // being installed first
              await this.chartManager.install(
                NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
                constants.SOLO_CERT_MANAGER_CHART,
                constants.SOLO_CERT_MANAGER_CHART,
                context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
                soloChartVersion,
                '  --set cert-manager.installCRDs=true',
                context_.config.clusterContext,
              );
              showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion);
            }

            // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
            await this.k8Factory
              .getK8(context_.config.clusterContext)
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

            await this.chartManager.upgrade(
              NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
              constants.SOLO_CERT_MANAGER_CHART,
              constants.SOLO_CERT_MANAGER_CHART,
              context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
              soloChartVersion,
              soloCertManagerValuesArgument,
              context_.config.clusterContext,
            );
            showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion, 'Upgraded');
          },
          skip: (context_): boolean => !context_.config.enableExplorerTls,
        },
        {
          title: 'Install explorer',
          task: async (context_): Promise<void> => {
            const config: ExplorerDeployConfigClass = context_.config;

            let exploreValuesArgument: string = prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
            exploreValuesArgument += await this.prepareHederaExplorerValuesArg(config);

            config.explorerVersion = Version.getValidSemanticVersion(config.explorerVersion, false, 'Explorer version');

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              '',
              constants.EXPLORER_CHART_URL,
              config.explorerVersion,
              exploreValuesArgument,
              context_.config.clusterContext,
            );
            showVersionBanner(this.logger, config.releaseName, config.explorerVersion);
          },
        },
        {
          title: 'Install explorer ingress controller',
          task: async (context_): Promise<void> => {
            const config: ExplorerDeployConfigClass = context_.config;

            let explorerIngressControllerValuesArgument: string = '';

            if (config.explorerStaticIp !== '') {
              explorerIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${config.explorerStaticIp}`;
            }
            explorerIngressControllerValuesArgument += ` --set fullnameOverride=${config.ingressReleaseName}`;
            explorerIngressControllerValuesArgument += ` --set controller.ingressClass=${config.ingressReleaseName}`;
            explorerIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${config.ingressReleaseName}`;
            if (config.tlsClusterIssuerType === 'self-signed') {
              explorerIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);
            }

            await this.chartManager.install(
              config.namespace,
              config.ingressReleaseName,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
              explorerIngressControllerValuesArgument,
              context_.config.clusterContext,
            );

            showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);

            // patch explorer ingress to use h1 protocol, haproxy ingress controller default backend protocol is h2
            // to support grpc over http/2
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingresses()
              .update(config.namespace, config.releaseName, {
                metadata: {
                  annotations: {
                    'haproxy-ingress.github.io/backend-protocol': 'h1',
                  },
                },
              });
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .create(config.ingressReleaseName, constants.INGRESS_CONTROLLER_PREFIX + config.ingressReleaseName);
          },
          skip: (context_): boolean => !context_.config.enableIngress,
        },
        {
          title: 'Check explorer pod is ready',
          task: async (context_): Promise<void> => {
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                Templates.renderExplorerLabels(context_.config.newExplorerComponent.metadata.id),
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
        },
        {
          title: 'Check haproxy ingress controller pod is ready',
          task: async (context_): Promise<void> => {
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                [
                  `app.kubernetes.io/name=${constants.INGRESS_CONTROLLER_RELEASE_NAME}`,
                  `app.kubernetes.io/instance=${context_.config.ingressReleaseName}`,
                ],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
          skip: (context_): boolean => !context_.config.enableIngress,
        },
        this.addMirrorNodeExplorerComponents(),
        {
          title: 'Enable port forwarding for explorer',
          skip: context_ => !context_.config.forcePortForward,
          task: async context_ => {
            const config: ExplorerDeployConfigClass = context_.config;

            const pods: Pod[] = await this.k8Factory
              .getK8(config.clusterContext)
              .pods()
              .list(config.namespace, Templates.renderExplorerLabels(context_.config.newExplorerComponent.metadata.id));
            if (pods.length === 0) {
              throw new SoloError('No Hiero Explorer pod found');
            }
            const podReference: PodReference = pods[0].podReference;

            await this.remoteConfig.configuration.components.managePortForward(
              config.clusterRef,
              podReference,
              constants.EXPLORER_PORT, // Pod port
              constants.EXPLORER_PORT, // Local port
              this.k8Factory.getK8(context_.config.clusterContext),
              this.logger,
              ComponentTypes.Explorer,
              'Explorer',
              false, // config.isChartInstalled, // Reuse existing port if chart is already installed
            );
          },
        },
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
      'explorer node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer deployment has completed');
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

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDestroyContext> = this.taskList.newTaskList<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<AnyListrContext> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();
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
              await this.inferDestroyData(namespace, clusterReference);

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

            return ListrLock.newAcquireLockTask(lease, task);
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
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      'explorer node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error destroy explorer: ${error.message}`, error);
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
  private addMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDeployContext> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          config.newExplorerComponent,
          ComponentTypes.Explorer,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private inferMirrorNodeId(config: ExplorerDeployConfigClass): void {
    if (typeof config.mirrorNodeId !== 'number') {
      config.mirrorNodeId = this.remoteConfig.configuration.components.state.mirrorNodes[0].metadata.id ?? 1;
    }
  }

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    return id === 1
      ? await this.chartManager.isChartInstalled(namespace, constants.EXPLORER_RELEASE_NAME, context)
      : false;
  }

  private async inferDestroyData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    id: ComponentId;
    releaseName: string;
    ingressReleaseName: string;
    isChartInstalled: boolean;
    isLegacyChartInstalled: boolean;
  }> {
    let id: ComponentId = this.configManager.getFlag(flags.id);

    if (typeof id !== 'number') {
      if (!this.remoteConfig.configuration.components.state.explorers[0]) {
        throw new SoloError('No explorer component found in remote config');
      }

      id = this.remoteConfig.configuration.components.state.explorers[0].metadata.id;
    }

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
      ingressReleaseName: this.renderIngressReleaseName(id),
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
