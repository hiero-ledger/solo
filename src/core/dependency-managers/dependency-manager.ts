// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import {SoloError} from '../errors/solo-error.js';
import {ShellRunner} from '../shell-runner.js';
import {HelmDependencyManager} from './helm-dependency-manager.js';
import {container, inject, injectable} from 'tsyringe-neo';
import * as constants from '../constants.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloListrTask} from '../../types/index.js';

@injectable()
export class DependencyManager extends ShellRunner {
  private readonly depManagerMap: Map<string, HelmDependencyManager>;

  public constructor(@inject(InjectTokens.HelmDependencyManager) helmDepManager?: HelmDependencyManager) {
    super();
    this.depManagerMap = helmDepManager
      ? new Map().set(constants.HELM, helmDepManager)
      : new Map().set(constants.HELM, container.resolve(HelmDependencyManager));
  }

  /**
   * Check if the required dependency is installed or not
   * @param dep - is the name of the program
   * @param [shouldInstall] - Whether or not install the dependency if not installed
   */
  public async checkDependency(dep: string, shouldInstall: boolean = true): Promise<boolean> {
    this.logger.debug(`Checking for dependency: ${dep}`);

    let status: boolean = false;
    const manager: HelmDependencyManager = this.depManagerMap.get(dep);
    if (manager) {
      status = await manager.checkVersion(shouldInstall);
    }

    if (!status) {
      throw new SoloError(`Dependency '${dep}' is not found`);
    }

    this.logger.debug(`Dependency '${dep}' is found`);
    return true;
  }

  public taskCheckDependencies<T>(deps: string[]): SoloListrTask<T>[] {
    return deps.map(dep => {
      return {
        title: `Check dependency: ${dep} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
        task: () => this.checkDependency(dep),
      };
    });
  }
}
