// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../core/task-list/task-list.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';
import {ExplorerCommandDefinition} from '../../command-definitions/explorer-command-definition.js';
import {Flags} from '../../flags.js';
import {
  appendConfigToArgv,
  argvPushGlobalFlags,
  invokeSoloCommand,
  newArgv,
  optionFromFlag,
} from '../../command-helpers.js';
import {type OrchestratorStep} from './orchestrator-step.js';

@injectable()
export class DeployExplorerStep implements OrchestratorStep<
  OneShotSingleDeployConfigClass,
  OneShotSingleDeployContext
> {
  private static readonly MIRROR_NODE_ID: number = 1;

  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public buildArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.explorerVersion)]: config.versions.explorer,
      [optionFromFlag(Flags.mirrorNodeId)]: DeployExplorerStep.MIRROR_NODE_ID,
      [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
      ...config.explorerNodeConfiguration,
    });
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public asListrTask(config: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> {
    return invokeSoloCommand(
      `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
      ExplorerCommandDefinition.ADD_COMMAND,
      (): string[] => this.buildArgv(config),
      this.taskList,
      (): boolean => !config.deployExplorer && !config.minimalSetup,
    );
  }
}
