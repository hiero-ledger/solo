// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloEventBus} from '../../../../core/events/solo-event-bus.js';
import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type OneShotDestroyOrchestrator} from './one-shot-destroy-orchestrator.js';
import {Phase} from '../phase.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {invokeSoloCommand} from '../../../command-helpers.js';
import * as constants from '../../../../core/constants.js';
import {
  buildClusterDisconnectArgv,
  buildClusterResetArgv,
  buildDeploymentDeleteArgv,
  buildDestroyBlockNodeArgv,
  buildDestroyConsensusNodeArgv,
  buildDestroyExplorerArgv,
  buildDestroyMirrorNodeArgv,
  buildDestroyRelayArgv,
} from './destroy-argv-builders.js';

@injectable()
export class DefaultOneShotDestroyOrchestrator implements OneShotDestroyOrchestrator {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
  }

  public buildDestroyTaskList(
    config: OneShotSingleDestroyConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
  ): SoloListr<OneShotSingleDestroyContext> {
    const phases: Array<Phase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>> = [
      Phase.composite(
        'Destroy extended setup',
        [
          new Phase('Destroy explorer', {
            asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
              invokeSoloCommand(
                `solo ${ExplorerCommandDefinition.DESTROY_COMMAND}`,
                ExplorerCommandDefinition.DESTROY_COMMAND,
                (): string[] => buildDestroyExplorerArgv(c),
                this.taskList,
                (): boolean => !c.hasExplorers,
              ),
          }),
          new Phase('Destroy relay', {
            asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
              invokeSoloCommand(
                `solo ${RelayCommandDefinition.DESTROY_COMMAND}`,
                RelayCommandDefinition.DESTROY_COMMAND,
                (): string[] => buildDestroyRelayArgv(c),
                this.taskList,
                (): boolean => !c.hasRelays,
              ),
          }),
        ],
        'concurrent',
        false,
      ),
      new Phase('Destroy mirror node', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${MirrorCommandDefinition.DESTROY_COMMAND}`,
            MirrorCommandDefinition.DESTROY_COMMAND,
            (): string[] => buildDestroyMirrorNodeArgv(c),
            this.taskList,
            (): boolean => c.skipAll || !c.deployment || !c.hasMirrorNodes,
          ),
      }),
      new Phase('Destroy block node', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${BlockCommandDefinition.DESTROY_COMMAND}`,
            BlockCommandDefinition.DESTROY_COMMAND,
            (): string[] => buildDestroyBlockNodeArgv(c),
            this.taskList,
            (): boolean =>
              c.skipAll ||
              !c.deployment ||
              constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true' ||
              c.hasBlockNodes === false,
          ),
      }),
      new Phase('Destroy consensus node', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.DESTROY_COMMAND}`,
            ConsensusCommandDefinition.DESTROY_COMMAND,
            (): string[] => buildDestroyConsensusNodeArgv(c),
            this.taskList,
            (): boolean => c.skipAll || !c.deployment,
          ),
      }),
      new Phase('Cluster reset', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.RESET_COMMAND}`,
            ClusterReferenceCommandDefinition.RESET_COMMAND,
            (): string[] => buildClusterResetArgv(c),
            this.taskList,
            (): boolean => c.skipAll || !c.deployment,
          ),
      }),
      new Phase('Cluster disconnect', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.DISCONNECT_COMMAND}`,
            ClusterReferenceCommandDefinition.DISCONNECT_COMMAND,
            (): string[] => buildClusterDisconnectArgv(c),
            this.taskList,
            (): boolean => c.skipAll || !c.deployment,
          ),
      }),
      new Phase('Deployment delete', {
        asListrTask: (c: OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
          invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.DELETE_COMMAND}`,
            DeploymentCommandDefinition.DELETE_COMMAND,
            (): string[] => buildDeploymentDeleteArgv(c),
            this.taskList,
            (): boolean => !c.deployment,
          ),
      }),
    ];

    return parentTask.newListr(
      phases.map(
        (
          phase: Phase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>,
        ): SoloListrTask<OneShotSingleDestroyContext> => phase.asListrTask(config, this.eventBus),
      ),
      {concurrent: false, rendererOptions: {collapseSubtasks: false}},
    );
  }
}
