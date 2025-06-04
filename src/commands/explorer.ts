// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as helpers from '../core/helpers.js';
import {prepareValuesFiles, showVersionBanner} from '../core/helpers.js';
import {
  type ClusterReference,
  type CommandDefinition,
  type ComponentId,
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
import {Lock} from '../core/lock/lock.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {CommandFlag, CommandFlags} from '../types/flag-types.js';
import {ExplorerStateSchema} from '../data/schema/model/remote/state/explorer-state-schema.js';
import {Templates} from '../core/templates.js';

interface ExplorerDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  clusterRef: ClusterReference;
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
  id: ComponentId; // Mirror node id
  useLegacyReleaseName: boolean;
  newExplorerComponent: ExplorerStateSchema;
}

interface ExplorerDeployContext {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

interface ExplorerDestroyContext {
  config: {
    clusterContext: string;
    clusterReference: ClusterReference;
    namespace: NamespaceName;
    isChartInstalled: boolean;
    id: ComponentId;
    releaseName: string;
    ingressReleaseName: string;
    useLegacyReleaseName: boolean;
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

  public static readonly COMMAND_NAME: string = 'explorer';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

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
      flags.id,
    ],
  };

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.deployment, flags.id],
  };

  /**
   * @param config - the configuration object
   */
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

    let useLegacyReleaseName: boolean = false;
    if (config.id === 1) {
      const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
        config.namespace,
        constants.MIRROR_NODE_RELEASE_NAME,
        config.clusterContext,
      );

      useLegacyReleaseName = !!isLegacyChartInstalled;
    }

    const mirrorNodeReleaseName: string = useLegacyReleaseName
      ? constants.MIRROR_NODE_RELEASE_NAME
      : `${constants.MIRROR_NODE_RELEASE_NAME}-${config.id}`;

    if (config.mirrorNamespace) {
      // use fully qualified service name for mirror node since the explorer is in a different namespace
      valuesArgument += ` --set proxyPass./api="http://${mirrorNodeReleaseName}-rest.${config.mirrorNamespace}.svc.cluster.local" `;
    } else {
      valuesArgument += ` --set proxyPass./api="http://${mirrorNodeReleaseName}-rest" `;
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
          constants.EXPLORER_INGRESS_TLS_SECRET_NAME,
        );

        if (config.enableIngress) {
          valuesArgument += ` --set ingress.tls[0].hosts[0]=${config.domainName}`;
        }
      }
    }
    return valuesArgument;
  }

  /**
   * @param config - the configuration object
   */
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

  private getReleaseName(id?: ComponentId): string {
    if (!id) {
      id = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer);
    }
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  private getIngressReleaseName(id?: ComponentId): string {
    if (!id) {
      id = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer);
    }
    return `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}`;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<ExplorerDeployContext> = new Listr<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            this.configManager.update(argv);

            // disable the prompts that we don't want to prompt the user for
            flags.disablePrompts(ExplorerCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional,
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(ExplorerCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'valuesArg',
            ]) as ExplorerDeployConfigClass;

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.remoteConfig.currentCluster;
            }

            context_.config.clusterContext = this.localConfig.configuration.clusterRefs
              .get(context_.config.clusterRef)
              ?.toString();

            context_.config.releaseName = this.getReleaseName();
            context_.config.ingressReleaseName = this.getIngressReleaseName();

            if (typeof context_.config.id !== 'number') {
              context_.config.id = context_.config.mirrorNamespace
                ? 1
                : this.remoteConfig.configuration.components.state.mirrorNodes[0].metadata.id;
            }

            context_.config.newExplorerComponent = this.componentFactory.createNewExplorerComponent(
              context_.config.clusterRef,
              context_.config.namespace,
            );

            context_.config.valuesArg += await this.prepareValuesArg(context_.config);

            if (
              !(await this.k8Factory.getK8(context_.config.clusterContext).namespaces().has(context_.config.namespace))
            ) {
              throw new SoloError(`namespace ${context_.config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.loadRemoteConfigTask(argv),
        {
          title: 'Install cert manager',
          task: async (context_): Promise<void> => {
            const config: ExplorerDeployConfigClass = context_.config;
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
            await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 10_000));

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
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      this.logger.debug('explorer deployment has completed');
    } catch (error) {
      throw new SoloError(`Error deploying explorer: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<ExplorerDestroyContext> = new Listr<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<AnyListrContext> => {
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
            const namespace: NamespaceName = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            const clusterReference: ClusterReference = this.configManager.hasFlag(flags.clusterRef)
              ? this.configManager.getFlag(flags.clusterRef)
              : this.remoteConfig.currentCluster;

            const clusterContext: Context = this.localConfig.configuration.clusterRefs
              .get(clusterReference)
              ?.toString();
            const id: ComponentId = this.configManager.getFlag(flags.id);
            const releaseName: string = this.getReleaseName(id);
            const ingressReleaseName: string = this.getIngressReleaseName(id);
            context_.config = {
              namespace,
              clusterContext,
              clusterReference,
              id,
              releaseName,
              ingressReleaseName,
              isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, clusterContext),
              useLegacyReleaseName: false,
            };

            if (typeof context_.config.id !== 'number') {
              context_.config.id = this.remoteConfig.configuration.components.state.explorers[0]?.metadata?.id;
              context_.config.releaseName = this.getReleaseName(context_.config.id);
              context_.config.ingressReleaseName = this.getIngressReleaseName(context_.config.id);
            }

            if (context_.config.id === 1) {
              const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
                context_.config.namespace,
                constants.MIRROR_NODE_RELEASE_NAME,
                context_.config.clusterContext,
              );

              if (isLegacyChartInstalled) {
                context_.config.isChartInstalled = true;
                context_.config.useLegacyReleaseName = true;
                context_.config.releaseName = constants.EXPLORER_RELEASE_NAME;
                context_.config.ingressReleaseName = constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME;
              }
            }

            if (!(await this.k8Factory.getK8(context_.config.clusterContext).namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace.name} does not exist`);
            }

            if (!context_.config.id) {
              throw new SoloError('Explorer is not found');
            }

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
            // delete ingress class if found one
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
    );

    try {
      await tasks.run();
      this.logger.debug('explorer destruction has completed');
    } catch (error) {
      throw new SoloError(`Error destroy explorer: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: ExplorerCommand.COMMAND_NAME,
      desc: 'Manage Explorer in solo network',
      builder: (yargs: AnyYargs): AnyYargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy explorer',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running explorer deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then((r): void => {
                  self.logger.info('==== Finished running explorer deploy`====');
                  if (!r) {
                    throw new Error('Explorer deployment failed, expected return value to be true');
                  }
                })
                .catch((error): never => {
                  throw new SoloError(`Explorer deployment failed: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy explorer',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info('==== Running explorer destroy ===');
              self.logger.info(argv);

              await self
                .destroy(argv)
                .then((r): void => {
                  self.logger.info('==== Finished running explorer destroy ====');
                  if (!r) {
                    throw new SoloError('Explorer destruction failed, expected return value to be true');
                  }
                })
                .catch((error): never => {
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
        this.remoteConfig.configuration.components.removeComponent(context_.config.id, ComponentTypes.Explorer);

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
        this.remoteConfig.configuration.components.addNewComponent(
          context_.config.newExplorerComponent,
          ComponentTypes.Explorer,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
