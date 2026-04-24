// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloListrTask} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {Flags} from '../../../flags.js';
import {argvPushGlobalFlags, invokeSoloCommand, newArgv, optionFromFlag} from '../../../command-helpers.js';
import {type OrchestratorStep} from '../orchestrator-step.js';

@injectable()
export class DestroyMirrorNodeStep implements OrchestratorStep<
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
      ...MirrorCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.devMode),
    );
    return argvPushGlobalFlags(argv);
  }

  public asListrTask(config: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> {
    return invokeSoloCommand(
      `solo ${MirrorCommandDefinition.DESTROY_COMMAND}`,
      MirrorCommandDefinition.DESTROY_COMMAND,
      (): string[] => this.buildArgv(config),
      this.taskList,
      (): boolean => config.skipAll || !config.deployment || !config.hasMirrorNodes,
    );
  }
}
