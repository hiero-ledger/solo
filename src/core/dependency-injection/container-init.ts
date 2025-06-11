// SPDX-License-Identifier: Apache-2.0

import {container, type DependencyContainer} from 'tsyringe-neo';
import {type SoloLogger} from '../logging/solo-logger.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {DependencyManager, HelmDependencyManager} from '../dependency-managers/index.js';
import * as constants from '../constants.js';
import {ChartManager} from '../chart-manager.js';
import {ConfigManager} from '../config-manager.js';
import {LayeredConfigProvider} from '../../data/configuration/impl/layered-config-provider.js';
import {AccountManager} from '../account-manager.js';
import {PlatformInstaller} from '../platform-installer.js';
import {KeyManager} from '../key-manager.js';
import {ProfileManager} from '../profile-manager.js';
import {IntervalLockRenewalService} from '../lock/interval-lock-renewal.js';
import {LockManager} from '../lock/lock-manager.js';
import {CertificateManager} from '../certificate-manager.js';
import os from 'node:os';
import * as version from '../../../version.js';
import {NetworkNodes} from '../network-nodes.js';
import {ClusterChecks} from '../cluster-checks.js';
import {InjectTokens} from './inject-tokens.js';
import {K8ClientFactory} from '../../integration/kube/k8-client/k8-client-factory.js';
import {ClusterCommandHandlers} from '../../commands/cluster/handlers.js';
import {ClusterCommandTasks} from '../../commands/cluster/tasks.js';
import {NodeCommandHandlers} from '../../commands/node/handlers.js';
import {NodeCommandTasks} from '../../commands/node/tasks.js';
import {ClusterCommandConfigs} from '../../commands/cluster/configs.js';
import {NodeCommandConfigs} from '../../commands/node/configs.js';
import {ErrorHandler} from '../error-handler.js';
import {ClassToObjectMapper} from '../../data/mapper/impl/class-to-object-mapper.js';
import {HelmExecutionBuilder} from '../../integration/helm/execution/helm-execution-builder.js';
import {DefaultHelmClient} from '../../integration/helm/impl/default-helm-client.js';
import {HelpRenderer} from '../help-renderer.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {AccountCommand} from '../../commands/account.js';
import {DeploymentCommand} from '../../commands/deployment.js';
import {ExplorerCommand} from '../../commands/explorer.js';
import {InitCommand} from '../../commands/init.js';
import {MirrorNodeCommand} from '../../commands/mirror-node.js';
import {RelayCommand} from '../../commands/relay.js';
import {NetworkCommand} from '../../commands/network.js';
import {NodeCommand} from '../../commands/node/index.js';
import {ClusterCommand} from '../../commands/cluster/index.js';
import {Middlewares} from '../middlewares.js';
import {SoloWinstonLogger} from '../logging/solo-winston-logger.js';
import {SingletonContainer} from './singleton-container.js';
import {ValueContainer} from './value-container.js';
import {BlockNodeCommand} from '../../commands/block-node.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {LocalConfigSource} from '../../data/configuration/impl/local-config-source.js';
import {RemoteConfigRuntimeState} from '../../business/runtime-state/config/remote/remote-config-runtime-state.js';
import {ComponentFactory} from '../config/remote/component-factory.js';
import {RemoteConfigValidator} from '../config/remote/remote-config-validator.js';
import {type ConfigProvider} from '../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../data/configuration/impl/default-config-source.js';
import {type SoloConfigSchema} from '../../data/schema/model/solo/solo-config-schema.js';
import {SoloConfigSchemaDefinition} from '../../data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {BeanFactorySupplier} from './bean-factory-supplier.js';

export type InstanceOverrides = Map<symbol, SingletonContainer | ValueContainer>;

/**
 * Container class to manage the dependency injection container
 */
export class Container {
  private static instance: Container = undefined;
  private static isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance of the container
   */
  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }

    return Container.instance;
  }

  private static singletonContainers(): SingletonContainer[] {
    return [
      new SingletonContainer(InjectTokens.SoloLogger, SoloWinstonLogger),
      new SingletonContainer(InjectTokens.LockRenewalService, IntervalLockRenewalService),
      new SingletonContainer(InjectTokens.LockManager, LockManager),
      new SingletonContainer(InjectTokens.K8Factory, K8ClientFactory),
      new SingletonContainer(InjectTokens.PackageDownloader, PackageDownloader),
      new SingletonContainer(InjectTokens.Zippy, Zippy),
      new SingletonContainer(InjectTokens.DependencyManager, DependencyManager),
      new SingletonContainer(InjectTokens.Helm, DefaultHelmClient),
      new SingletonContainer(InjectTokens.HelmExecutionBuilder, HelmExecutionBuilder),
      new SingletonContainer(InjectTokens.HelmDependencyManager, HelmDependencyManager),
      new SingletonContainer(InjectTokens.ChartManager, ChartManager),
      new SingletonContainer(InjectTokens.ConfigManager, ConfigManager),
      new SingletonContainer(InjectTokens.AccountManager, AccountManager),
      new SingletonContainer(InjectTokens.PlatformInstaller, PlatformInstaller),
      new SingletonContainer(InjectTokens.KeyManager, KeyManager),
      new SingletonContainer(InjectTokens.ProfileManager, ProfileManager),
      new SingletonContainer(InjectTokens.CertificateManager, CertificateManager),
      new SingletonContainer(InjectTokens.LocalConfigRuntimeState, LocalConfigRuntimeState),
      new SingletonContainer(InjectTokens.LocalConfigSource, LocalConfigSource),
      new SingletonContainer(InjectTokens.RemoteConfigRuntimeState, RemoteConfigRuntimeState),
      new SingletonContainer(InjectTokens.ClusterChecks, ClusterChecks),
      new SingletonContainer(InjectTokens.NetworkNodes, NetworkNodes),
      new SingletonContainer(InjectTokens.Middlewares, Middlewares),
      new SingletonContainer(InjectTokens.HelpRenderer, HelpRenderer),
      new SingletonContainer(InjectTokens.ConfigProvider, LayeredConfigProvider),
      new SingletonContainer(InjectTokens.AccountCommand, AccountCommand),
      new SingletonContainer(InjectTokens.ClusterCommand, ClusterCommand),
      new SingletonContainer(InjectTokens.NodeCommand, NodeCommand),
      new SingletonContainer(InjectTokens.DeploymentCommand, DeploymentCommand),
      new SingletonContainer(InjectTokens.ExplorerCommand, ExplorerCommand),
      new SingletonContainer(InjectTokens.InitCommand, InitCommand),
      new SingletonContainer(InjectTokens.MirrorNodeCommand, MirrorNodeCommand),
      new SingletonContainer(InjectTokens.NetworkCommand, NetworkCommand),
      new SingletonContainer(InjectTokens.RelayCommand, RelayCommand),
      new SingletonContainer(InjectTokens.BlockNodeCommand, BlockNodeCommand),
      new SingletonContainer(InjectTokens.ClusterCommandTasks, ClusterCommandTasks),
      new SingletonContainer(InjectTokens.ClusterCommandHandlers, ClusterCommandHandlers),
      new SingletonContainer(InjectTokens.NodeCommandTasks, NodeCommandTasks),
      new SingletonContainer(InjectTokens.NodeCommandHandlers, NodeCommandHandlers),
      new SingletonContainer(InjectTokens.ClusterCommandConfigs, ClusterCommandConfigs),
      new SingletonContainer(InjectTokens.NodeCommandConfigs, NodeCommandConfigs),
      new SingletonContainer(InjectTokens.ErrorHandler, ErrorHandler),
      new SingletonContainer(InjectTokens.ObjectMapper, ClassToObjectMapper),
      new SingletonContainer(InjectTokens.ComponentFactory, ComponentFactory),
      new SingletonContainer(InjectTokens.RemoteConfigValidator, RemoteConfigValidator),
    ];
  }

  private static valueContainers(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
  ): ValueContainer[] {
    return [
      new ValueContainer(InjectTokens.LogLevel, logLevel),
      new ValueContainer(InjectTokens.DevelopmentMode, developmentMode),
      new ValueContainer(InjectTokens.HomeDirectory, homeDirectory),
      new ValueContainer(InjectTokens.OsPlatform, os.platform()),
      new ValueContainer(InjectTokens.OsArch, os.arch()),
      new ValueContainer(InjectTokens.HelmInstallationDir, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(InjectTokens.HelmVersion, version.HELM_VERSION),
      new ValueContainer(InjectTokens.SystemAccounts, constants.SYSTEM_ACCOUNTS),
      new ValueContainer(InjectTokens.CacheDir, cacheDirectory),
      new ValueContainer(InjectTokens.LocalConfigFileName, constants.DEFAULT_LOCAL_CONFIG_FILE),
      new ValueContainer(InjectTokens.KeyFormatter, ConfigKeyFormatter.instance()),
    ];
  }

  private static factorySuppliers(): BeanFactorySupplier<unknown>[] {
    return [
      new BeanFactorySupplier<ConfigProvider>(
        InjectTokens.ConfigProvider,
        (container: DependencyContainer): ConfigProvider => {
          const objectMapper: ClassToObjectMapper = container.resolve<ClassToObjectMapper>(InjectTokens.ObjectMapper);

          const defaultConfigSource: DefaultConfigSource<SoloConfigSchema> = new DefaultConfigSource<SoloConfigSchema>(
            'solo-config.yaml',
            PathEx.join('resources', 'config'),
            new SoloConfigSchemaDefinition(objectMapper),
            objectMapper,
          );

          const provider: ConfigProvider = new LayeredConfigProvider(objectMapper);
          provider.builder().withDefaultSources().withSources(defaultConfigSource).withMergeSourceValues(true).build();
          return provider;
        },
      ),
    ];
  }

  /**
   * Initialize the container with the default dependencies
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public init(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
    overrides: InstanceOverrides = new Map<symbol, SingletonContainer | ValueContainer>(),
  ): void {
    if (Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container already initialized');
      return;
    }

    const singletonContainers: SingletonContainer[] = Container.singletonContainers();

    const valueContainers: ValueContainer[] = Container.valueContainers(
      homeDirectory,
      cacheDirectory,
      logLevel,
      developmentMode,
    );

    for (const [token, override] of overrides) {
      if (override instanceof SingletonContainer) {
        container.register(token, {useClass: override.useClass}, {lifecycle: override.lifecycle});
      } else if (override instanceof ValueContainer) {
        container.register(override.token, {useValue: override.useValue});
      }
    }

    for (const value of valueContainers) {
      if (!overrides.get(value.token)) {
        container.register(value.token, {useValue: value.useValue});
      }
    }

    for (const singleton of singletonContainers) {
      if (!overrides.get(singleton.token)) {
        container.register(singleton.token, {useClass: singleton.useClass}, {lifecycle: singleton.lifecycle});
      }
    }

    for (const supplier of Container.factorySuppliers()) {
      supplier.register(container);
    }

    container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container initialized');
    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public reset(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    overrides?: InstanceOverrides,
  ): void {
    if (Container.instance && Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Resetting container');
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, overrides);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public clearInstances(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    overrides?: InstanceOverrides,
  ): void {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, overrides);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  public async dispose(): Promise<void> {
    await container.dispose();
  }
}
