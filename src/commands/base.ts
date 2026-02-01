// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import {ShellRunner} from '../core/shell-runner.js';
import {type LockManager} from '../core/lock/lock-manager.js';
import {type ChartManager} from '../core/chart-manager.js';
import {type ConfigManager} from '../core/config-manager.js';
import {type DependencyManager} from '../core/dependency-managers/index.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type HelmClient} from '../integration/helm/helm-client.js';
import {type LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import * as constants from '../core/constants.js';
import fs from 'node:fs';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentId,
  type Context,
  NamespaceNameAsString,
  Optional,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Flags as flags, Flags} from './flags.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject} from 'tsyringe-neo';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type TaskList} from '../core/task-list/task-list.js';
import {ListrContext, ListrRendererValue} from 'listr2';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {AnyListrContext} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {Templates} from '../core/templates.js';
import {BaseStateSchema} from '../data/schema/model/remote/state/base-state-schema.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';

export abstract class BaseCommand extends ShellRunner {
  public constructor(
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.K8Factory) protected readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
    @inject(InjectTokens.ConfigManager) public readonly configManager?: ConfigManager,
    @inject(InjectTokens.DependencyManager) protected readonly depManager?: DependencyManager,
    @inject(InjectTokens.LockManager) protected readonly leaseManager?: LockManager,
    @inject(InjectTokens.LocalConfigRuntimeState) public readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) protected readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.TaskList)
    protected readonly taskList?: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.ComponentFactory) protected readonly componentFactory?: ComponentFactoryApi,
  ) {
    super();

    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.componentFactory = patchInject(componentFactory, InjectTokens.ComponentFactory, this.constructor.name);
  }

  /**
   * Prepare the values files map for each cluster
   *
   * Order of precedence:
   * 1. Chart's default values file (if chartDirectory is set)
   * 2. Profile values file
   * 3. User's values file
   * @param clusterReferences
   * @param valuesFileInput - the values file input string
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - mapping of clusterRef to the profile values file full path
   */
  public static prepareValuesFilesMapMultipleCluster(
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: Record<ClusterReferenceName, string>,
    valuesFileInput?: string,
  ): Record<ClusterReferenceName, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterReferenceName, string> = {[Flags.KEY_COMMON]: ''};
    for (const [clusterReference] of clusterReferences) {
      valuesFiles[clusterReference] = '';
    }

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile: string = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterReference in valuesFiles) {
        valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      for (const [clusterReference, file] of Object.entries(profileValuesFile)) {
        const valuesArgument: string = ` --values ${file}`;

        if (clusterReference === Flags.KEY_COMMON) {
          for (const clusterReference_ of Object.keys(valuesFiles)) {
            valuesFiles[clusterReference_] += valuesArgument;
          }
        } else {
          valuesFiles[clusterReference] += valuesArgument;
        }
      }
    }

    if (valuesFileInput) {
      const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(valuesFileInput);
      for (const [clusterReference, files] of Object.entries(parsed)) {
        let vf: string = '';
        for (const file of files) {
          vf += ` --values ${file}`;
        }

        if (clusterReference === Flags.KEY_COMMON) {
          for (const [clusterReference_] of Object.entries(valuesFiles)) {
            valuesFiles[clusterReference_] += vf;
          }
        } else {
          valuesFiles[clusterReference] += vf;
        }
      }
    }

    if (Object.keys(valuesFiles).length > 1) {
      // delete the common key if there is another cluster to use
      delete valuesFiles[Flags.KEY_COMMON];
    }

    return valuesFiles;
  }

  /**
   * Prepare the values files map for each cluster
   *
   * Order of precedence:
   * 1. Chart's default values file (if chartDirectory is set)
   * 2. Profile values file
   * 3. User's values file
   * @param clusterReferences
   * @param valuesFileInput - the values file input string
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - the profile values file full path
   */
  public static prepareValuesFilesMap(
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: string,
    valuesFileInput?: string,
  ): Record<ClusterReferenceName, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterReferenceName, string> = {
      [Flags.KEY_COMMON]: '',
    };
    for (const [clusterReference] of clusterReferences) {
      valuesFiles[clusterReference] = '';
    }

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile: string = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterReference in valuesFiles) {
        valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(profileValuesFile);
      for (const [clusterReference, files] of Object.entries(parsed)) {
        let vf: string = '';
        for (const file of files) {
          vf += ` --values ${file}`;
        }

        if (clusterReference === Flags.KEY_COMMON) {
          for (const [cf] of Object.entries(valuesFiles)) {
            valuesFiles[cf] += vf;
          }
        } else {
          valuesFiles[clusterReference] += vf;
        }
      }
    }

    if (valuesFileInput) {
      const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(valuesFileInput);
      for (const [clusterReference, files] of Object.entries(parsed)) {
        let vf: string = '';
        for (const file of files) {
          vf += ` --values ${file}`;
        }

        if (clusterReference === Flags.KEY_COMMON) {
          for (const [clusterReference_] of Object.entries(valuesFiles)) {
            valuesFiles[clusterReference_] += vf;
          }
        } else {
          valuesFiles[clusterReference] += vf;
        }
      }
    }

    if (Object.keys(valuesFiles).length > 1) {
      // delete the common key if there is another cluster to use
      delete valuesFiles[Flags.KEY_COMMON];
    }

    return valuesFiles;
  }

  public abstract close(): Promise<void>;

  /**
   * Setup home directories
   * @param directories
   */
  public setupHomeDirectory(directories: string[] = []): string[] {
    if (!directories || directories?.length === 0) {
      directories = [
        constants.SOLO_HOME_DIR,
        constants.SOLO_LOGS_DIR,
        this.configManager.getFlag(Flags.cacheDir) || constants.SOLO_CACHE_DIR,
        constants.SOLO_VALUES_DIR,
      ];
    }

    try {
      for (const directoryPath of directories) {
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath, {recursive: true});
        }
        this.logger.debug(`OK: setup directory: ${directoryPath}`);
      }
    } catch (error) {
      throw new SoloError(`failed to create directory: ${error.message}`, error);
    }

    return directories;
  }

  protected getClusterReference(): ClusterReferenceName {
    const flagValue: ClusterReferenceName = this.configManager.getFlag(flags.clusterRef);

    // If flag is provided, use it
    if (flagValue) {
      return flagValue;
    }

    // Try to auto-select if only one cluster exists in the deployment
    try {
      if (this.remoteConfig?.isLoaded()) {
        const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

        if (clusterReferences.size === 1) {
          // Auto-select the only available cluster
          const clusterReference: ClusterReferenceName = [...clusterReferences.keys()][0];
          this.logger.debug(`Auto-selected cluster reference: ${clusterReference} (only cluster in deployment)`);
          return clusterReference;
        } else if (clusterReferences.size > 1) {
          // Multiple clusters exist - list them in error message
          const clusterList: string = [...clusterReferences.keys()].join(', ');
          throw new SoloError(`Multiple clusters found (${clusterList}). Please specify --cluster-ref to select one.`);
        }
      }
    } catch (error) {
      // If it's our SoloError about multiple clusters, re-throw it
      if (error instanceof SoloError && error.message.includes('Multiple clusters found')) {
        throw error;
      }
      // Otherwise, fall through to default behavior
      this.logger.debug(`Could not auto-select cluster: ${error.message}`);
    }

    // Fall back to current cluster from kubeconfig
    return this.k8Factory.default().clusters().readCurrent();
  }

  protected getClusterContext(clusterReference: ClusterReferenceName): Context {
    return clusterReference
      ? this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString()
      : this.k8Factory.default().contexts().readCurrent();
  }

  protected getNamespace(task: SoloListrTaskWrapper<AnyListrContext>): Promise<NamespaceName> {
    return resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
  }

  protected async throwIfNamespaceIsMissing(context: Context, namespace: NamespaceName): Promise<void> {
    if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
      throw new SoloError(`namespace ${namespace} does not exist`);
    }
  }

  private inferMirrorNodeDataFromRemoteConfig(namespace: NamespaceName): {
    mirrorNodeId: ComponentId;
    mirrorNamespace: NamespaceNameAsString;
  } {
    let mirrorNodeId: ComponentId = this.configManager.getFlag(flags.mirrorNodeId);
    let mirrorNamespace: NamespaceNameAsString = this.configManager.getFlag(flags.mirrorNamespace);

    const mirrorNodeComponent: Optional<BaseStateSchema> =
      this.remoteConfig.configuration.components.state.mirrorNodes[0];

    if (!mirrorNodeId) {
      mirrorNodeId = mirrorNodeComponent?.metadata.id ?? 1;
    }

    if (!mirrorNamespace) {
      mirrorNamespace = mirrorNodeComponent?.metadata.namespace ?? namespace.name;
    }

    return {mirrorNodeId, mirrorNamespace};
  }

  protected async inferMirrorNodeData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    mirrorNodeId: ComponentId;
    mirrorNamespace: NamespaceNameAsString;
    mirrorNodeReleaseName: string;
  }> {
    const {mirrorNodeId, mirrorNamespace} = this.inferMirrorNodeDataFromRemoteConfig(namespace);

    const mirrorNodeReleaseName: string = await this.inferMirrorNodeReleaseName(mirrorNodeId, mirrorNamespace, context);

    return {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName};
  }

  private async inferMirrorNodeReleaseName(
    mirrorNodeId: ComponentId,
    mirrorNodeNamespace: string,
    context: Context,
  ): Promise<string> {
    if (mirrorNodeId !== 1) {
      return Templates.renderMirrorNodeName(mirrorNodeId);
    }

    // Try to get the component and use the precise cluster context
    try {
      const mirrorNodeComponent: BaseStateSchema = this.remoteConfig.configuration.components.getComponentById(
        ComponentTypes.MirrorNode,
        mirrorNodeId,
      );

      if (mirrorNodeComponent) {
        context = this.getClusterContext(mirrorNodeComponent.metadata.cluster);
      }
    } catch {
      // Guard
    }

    const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
      NamespaceName.of(mirrorNodeNamespace),
      constants.MIRROR_NODE_RELEASE_NAME,
      context,
    );

    return isLegacyChartInstalled ? constants.MIRROR_NODE_RELEASE_NAME : Templates.renderMirrorNodeName(mirrorNodeId);
  }

  protected async resolveNamespaceFromDeployment(task?: SoloListrTaskWrapper<AnyListrContext>): Promise<NamespaceName> {
    return await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
  }
}
