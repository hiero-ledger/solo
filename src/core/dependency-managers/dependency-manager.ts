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

export type DependencyManagerType =
  | HelmDependencyManager
  | KindDependencyManager
  | KubectlDependencyManager
  | PodmanDependencyManager;

@injectable()
export class DependencyManager extends ShellRunner {
  private readonly dependancyManagerMap: Map<string, DependencyManagerType>;

  public constructor(
    @inject(InjectTokens.HelmDependencyManager) helmDepManager?: HelmDependencyManager,
    @inject(InjectTokens.KindDependencyManager) kindDepManager?: KindDependencyManager,
    @inject(InjectTokens.KubectlDependencyManager) kubectlDependencyManager?: KubectlDependencyManager,
    @inject(InjectTokens.PodmanDependencyManager) podmanDependencyManager?: PodmanDependencyManager,
  ) {
    super();
    this.dependancyManagerMap = new Map();
    if (helmDepManager) {
      this.dependancyManagerMap.set(constants.HELM, helmDepManager);
    } else {
      this.dependancyManagerMap.set(constants.HELM, container.resolve(InjectTokens.HelmDependencyManager));
    }

    if (kindDepManager) {
      this.dependancyManagerMap.set(constants.KIND, kindDepManager);
    } else {
      this.dependancyManagerMap.set(constants.KIND, container.resolve(InjectTokens.KindDependencyManager));
    }

    if (kubectlDependencyManager) {
      this.dependancyManagerMap.set(constants.KUBECTL, kubectlDependencyManager);
    } else {
      this.dependancyManagerMap.set(constants.KUBECTL, container.resolve(InjectTokens.KubectlDependencyManager));
    }

    if (podmanDependencyManager) {
      this.dependancyManagerMap.set(constants.PODMAN, podmanDependencyManager);
    } else {
      this.dependancyManagerMap.set(constants.PODMAN, container.resolve(InjectTokens.PodmanDependencyManager));
    }
  }

  public async getDependency(dep: string): Promise<DependencyManagerType> {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dep);
    if (manager) {
      return manager;
    }
    throw new SoloError(`Dependency manager for '${dep}' is not found`);
  }

  /**
   * Check if the required dependency is installed or not
   * @param dep - is the name of the program
   */
  public async checkDependency(dep: string): Promise<boolean> {
    this.logger.debug(`Checking for dependency: ${dep}`);

    let status: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dep);
    if (manager) {
      status = await manager.install();
    }

    if (!status) {
      throw new SoloError(`Dependency '${dep}' is not found`);
    }

    this.logger.debug(`Dependency '${dep}' is found`);
    return true;
  }

  public async skipDependency(dep: string): Promise<boolean> {
    let skip: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dep);

    if (manager) {
      skip = !(await manager.shouldInstall());
    }

    this.logger.debug(`Skipping install of for dependency: ${dep}: ${skip}`);
    return skip;
  }

  public taskCheckDependencies<T>(deps: string[]): SoloListrTask<T>[] {
    return deps.map(dep => {
      return {
        title: `Check dependency: ${dep} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
        task: () => this.checkDependency(dep),
        skip: (): Promise<boolean> => this.skipDependency(dep),
      };
    });
  }

  public getExecutablePath(dep: string): string {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dep);
    if (manager) {
      return manager.getExecutablePath();
    }
    throw new SoloError(`Dependency manager for '${dep}' is not found`);
  }
}
