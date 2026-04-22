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
import {BlockCommandDefinition} from '../../command-definitions/block-command-definition.js';
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
export class DeployBlockNodeStep {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public buildArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(...BlockCommandDefinition.ADD_COMMAND.split(' '), optionFromFlag(Flags.deployment), config.deployment);

    // Build a local copy with the dev image values file appended, without mutating
    // config.blockNodeConfiguration — it may be an alias for another section's object
    // (e.g. via YAML anchors), causing the values file to leak into other commands.
    const blockExistingValuesFile: string = config.blockNodeConfiguration?.['--values-file'];
    const blockLocalConfig: AnyObject = {
      ...config.blockNodeConfiguration,
      '--values-file': blockExistingValuesFile
        ? `${blockExistingValuesFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`
        : constants.BLOCK_NODE_SOLO_DEV_FILE,
    };
    appendConfigToArgv(argv, blockLocalConfig);
    return argvPushGlobalFlags(argv);
  }

  public asListrTask(config: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> {
    return invokeSoloCommand(
      `solo ${BlockCommandDefinition.ADD_COMMAND}`,
      BlockCommandDefinition.ADD_COMMAND,
      (): string[] => this.buildArgv(config),
      this.taskList,
      (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
    );
  }
}
