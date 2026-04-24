// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloListrTask} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {Flags} from '../../../flags.js';
import {argvPushGlobalFlags, invokeSoloCommand, newArgv, optionFromFlag} from '../../../command-helpers.js';
import {type OrchestratorStep} from '../orchestrator-step.js';

@injectable()
export class DeploymentDeleteStep implements OrchestratorStep<
  OneShotSingleDestroyConfigClass,
  OneShotSingleDestroyContext
> {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public buildArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.DELETE_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }

  public asListrTask(config: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> {
    return invokeSoloCommand(
      `solo ${DeploymentCommandDefinition.DELETE_COMMAND}`,
      DeploymentCommandDefinition.DELETE_COMMAND,
      (): string[] => this.buildArgv(config),
      this.taskList,
      (): boolean => !config.deployment,
    );
  }
}
