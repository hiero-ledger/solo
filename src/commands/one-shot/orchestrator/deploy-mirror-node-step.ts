// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../core/task-list/task-list.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyObject} from '../../../types/aliases.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';
import {MirrorCommandDefinition} from '../../command-definitions/mirror-command-definition.js';
import {Flags} from '../../flags.js';
import {
  appendConfigToArgv,
  argvPushGlobalFlags,
  invokeSoloCommand,
  newArgv,
  optionFromFlag,
} from '../../command-helpers.js';
import * as constants from '../../../core/constants.js';

@injectable()
export class DeployMirrorNodeStep {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public buildArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.pinger),
      optionFromFlag(Flags.enableIngress),
      optionFromFlag(Flags.parallelDeploy),
      config.parallelDeploy.toString(),
    );
    // Append HikariCP limits file without mutating the shared config object.
    const mirrorExistingValuesFile: string = config.mirrorNodeConfiguration?.['--values-file'];
    const mirrorLocalConfig: AnyObject = {
      ...config.mirrorNodeConfiguration,
      '--values-file': mirrorExistingValuesFile
        ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
        : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
    };
    appendConfigToArgv(argv, mirrorLocalConfig);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public asListrTask(config: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> {
    return invokeSoloCommand(
      `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
      MirrorCommandDefinition.ADD_COMMAND,
      (): string[] => this.buildArgv(config),
      this.taskList,
      (): boolean => !config.deployMirrorNode,
    );
  }
}
