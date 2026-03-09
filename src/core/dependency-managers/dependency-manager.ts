// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import {SoloError} from '../errors/solo-error.js';
import {ShellRunner} from '../shell-runner.js';
import {HelmDependencyManager} from './helm-dependency-manager.js';
import {container, inject, injectable} from 'tsyringe-neo';
import * as constants from '../constants.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloListrTask} from '../../types/index.js';
import {KindDependencyManager} from './kind-dependency-manager.js';
import {KubectlDependencyManager} from './kubectl-dependency-manager.js';
import {PodmanDependencyManager} from './podman-dependency-manager.js';
import {VfkitDependencyManager} from './vfkit-dependency-manager.js';
import {GvproxyDependencyManager} from './gvproxy-dependency-manager.js';

export type DependencyManagerType =
  | HelmDependencyManager
  | KindDependencyManager
  | KubectlDependencyManager
  | PodmanDependencyManager
  | VfkitDependencyManager
  | GvproxyDependencyManager;

@injectable()
export class DependencyManager extends ShellRunner {
  private readonly dependancyManagerMap: Map<string, DependencyManagerType>;

  public constructor(
    @inject(InjectTokens.HelmDependencyManager) helmDepManager?: HelmDependencyManager,
    @inject(InjectTokens.KindDependencyManager) kindDepManager?: KindDependencyManager,
    @inject(InjectTokens.KubectlDependencyManager) kubectlDependencyManager?: KubectlDependencyManager,
    @inject(InjectTokens.PodmanDependencyManager) podmanDependencyManager?: PodmanDependencyManager,
    @inject(InjectTokens.VfkitDependencyManager) vfkitDependencyManager?: VfkitDependencyManager,
    @inject(InjectTokens.GvproxyDependencyManager) gvproxyDependencyManager?: GvproxyDependencyManager,
  ) {
    super();
    this.dependancyManagerMap = new Map();

    this.dependancyManagerMap.set(
      constants.HELM,
      helmDepManager || container.resolve(InjectTokens.HelmDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.KIND,
      kindDepManager || container.resolve(InjectTokens.KindDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.KUBECTL,
      kubectlDependencyManager || container.resolve(InjectTokens.KubectlDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.PODMAN,
      podmanDependencyManager || container.resolve(InjectTokens.PodmanDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.VFKIT,
      vfkitDependencyManager || container.resolve(InjectTokens.VfkitDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.GVPROXY,
      gvproxyDependencyManager || container.resolve(InjectTokens.GvproxyDependencyManager),
    );
  }

  public async getDependency(dependency: string): Promise<DependencyManagerType> {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      return manager;
    }
    throw new SoloError(`Dependency manager for '${dependency}' is not found`);
  }

  /**
   * Check if the required dependency is installed or not
   * @param dependency - is the name of the program
   */
  public async checkDependency(dependency: string): Promise<boolean> {
    this.logger.debug(`Checking for dependency: ${dependency}`);

    let status: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      status = await manager.install();
    }

    if (!status) {
      throw new SoloError(`Dependency '${dependency}' is not found`);
    }

    this.logger.debug(`Dependency '${dependency}' is found`);
    return true;
  }

  public async skipDependency(dependency: string): Promise<boolean> {
    let skip: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);

    if (manager) {
      skip = !(await manager.shouldInstall());
    }

    this.logger.debug(`Skipping install of for dependency: ${dependency}: ${skip}`);
    return skip;
  }

  public taskCheckDependencies<T>(dependencies: string[]): SoloListrTask<T>[] {
    return dependencies.map(
      (dependency): {title: string; task: () => Promise<boolean>; skip: () => Promise<boolean>} => {
        return {
          title: `Check dependency: ${dependency} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
          task: (): Promise<boolean> => this.checkDependency(dependency),
          skip: (): Promise<boolean> => this.skipDependency(dependency),
        };
      },
    );
  }

  public async getExecutable(dependency: string): Promise<string> {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      return await manager.getExecutable();
    }
    throw new SoloError(`Dependency manager for '${dependency}' is not found`);
  }
}
