// SPDX-License-Identifier: Apache-2.0

/**
 * Dependency injection tokens
 */
export class InjectTokens {
  public static ComponentFactory: symbol = Symbol.for('ComponentFactory');
  public static RemoteConfigValidator: symbol = Symbol.for('RemoteConfigValidator');
  public static LogLevel: symbol = Symbol.for('LogLevel');
  public static DevelopmentMode: symbol = Symbol.for('DevelopmentMode');
  public static OsPlatform: symbol = Symbol.for('OsPlatform');
  public static OsArch: symbol = Symbol.for('OsArch');
  public static HelmInstallationDir: symbol = Symbol.for('HelmInstallationDir');
  public static HelmVersion: symbol = Symbol.for('HelmVersion');
  public static SystemAccounts: symbol = Symbol.for('SystemAccounts');
  public static CacheDir: symbol = Symbol.for('CacheDir');
  public static LockRenewalService: symbol = Symbol.for('LockRenewalService');
  public static LockManager: symbol = Symbol.for('LockManager');
  public static K8Factory: symbol = Symbol.for('K8Factory');
  public static SoloLogger: symbol = Symbol.for('SoloLogger');
  public static PackageDownloader: symbol = Symbol.for('PackageDownloader');
  public static Zippy: symbol = Symbol.for('Zippy');
  public static DependencyManager: symbol = Symbol.for('DependencyManager');
  public static Helm: symbol = Symbol.for('Helm');
  public static HelmExecutionBuilder: symbol = Symbol.for('HelmExecutionBuilder');
  public static HelmDependencyManager: symbol = Symbol.for('HelmDependencyManager');
  public static ChartManager: symbol = Symbol.for('ChartManager');
  public static ConfigManager: symbol = Symbol.for('ConfigManager');
  public static AccountManager: symbol = Symbol.for('AccountManager');
  public static PlatformInstaller: symbol = Symbol.for('PlatformInstaller');
  public static KeyManager: symbol = Symbol.for('KeyManager');
  public static ProfileManager: symbol = Symbol.for('ProfileManager');
  public static CertificateManager: symbol = Symbol.for('CertificateManager');
  public static RemoteConfigRuntimeState: symbol = Symbol.for('RemoteConfigRuntimeState');
  public static ClusterChecks: symbol = Symbol.for('ClusterChecks');
  public static NetworkNodes: symbol = Symbol.for('NetworkNodes');
  public static AccountCommand: symbol = Symbol.for('AccountCommand');
  public static ClusterCommand: symbol = Symbol.for('ClusterCommand');
  public static NodeCommand: symbol = Symbol.for('NodeCommand');
  public static DeploymentCommand: symbol = Symbol.for('DeploymentCommand');
  public static ExplorerCommand: symbol = Symbol.for('ExplorerCommand');
  public static InitCommand: symbol = Symbol.for('InitCommand');
  public static MirrorNodeCommand: symbol = Symbol.for('MirrorNodeCommand');
  public static NetworkCommand: symbol = Symbol.for('NetworkCommand');
  public static RelayCommand: symbol = Symbol.for('RelayCommand');
  public static ClusterCommandTasks: symbol = Symbol.for('ClusterCommandTasks');
  public static ClusterCommandHandlers: symbol = Symbol.for('ClusterCommandHandlers');
  public static NodeCommandTasks: symbol = Symbol.for('NodeCommandTasks');
  public static NodeCommandHandlers: symbol = Symbol.for('NodeCommandHandlers');
  public static ClusterCommandConfigs: symbol = Symbol.for('ClusterCommandConfigs');
  public static NodeCommandConfigs: symbol = Symbol.for('NodeCommandConfigs');
  public static ErrorHandler: symbol = Symbol.for('ErrorHandler');
  public static ObjectMapper: symbol = Symbol.for('ObjectMapper');
  public static HelpRenderer: symbol = Symbol.for('HelpRenderer');
  public static Middlewares: symbol = Symbol.for('Middlewares');
  public static KeyFormatter: symbol = Symbol.for('KeyFormatter');
  public static CommandInvoker: symbol = Symbol.for('CommandInvoker');
  public static ConfigProvider: symbol = Symbol.for('ConfigProvider');
  public static BlockNodeCommand: symbol = Symbol.for('BlockNodeCommand');
  public static LocalConfigFileName: symbol = Symbol.for('LocalConfigFileName');
  public static LocalConfigSource: symbol = Symbol.for('LocalConfigSource');
  public static LocalConfigRuntimeState: symbol = Symbol.for('LocalConfigRuntimeState');
  public static HomeDirectory: symbol = Symbol.for('HomeDirectory');
  public static QuickStartCommand: symbol = Symbol.for('QuickStartCommand');
  public static TaskList: symbol = Symbol.for('TaskList');
  public static Commands: symbol = Symbol.for('Commands');
}
