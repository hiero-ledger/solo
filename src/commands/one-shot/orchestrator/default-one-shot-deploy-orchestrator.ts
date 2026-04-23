// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type SoloEventBus} from '../../../core/events/solo-event-bus.js';
import {SoloEventType} from '../../../core/events/event-types/event-types.js';
import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';
import {type OneShotDeployOrchestrator} from './one-shot-deploy-orchestrator.js';
import {DeployBlockNodeStep} from './deploy-block-node-step.js';
import {DeployNetworkPipelineStep} from './deploy-network-pipeline-step.js';
import {DeployMirrorNodeStep} from './deploy-mirror-node-step.js';
import {DeployExplorerStep} from './deploy-explorer-step.js';
import {DeployRelayStep} from './deploy-relay-step.js';
import {BlockCommandDefinition} from '../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../command-definitions/relay-command-definition.js';
import {Phase} from './phase.js';

@injectable()
export class DefaultOneShotDeployOrchestrator implements OneShotDeployOrchestrator {
  public constructor(
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.DeployBlockNodeStep) private readonly blockNodeStep: DeployBlockNodeStep,
    @inject(InjectTokens.DeployNetworkPipelineStep)
    private readonly networkPipelineStep: DeployNetworkPipelineStep,
    @inject(InjectTokens.DeployMirrorNodeStep) private readonly mirrorNodeStep: DeployMirrorNodeStep,
    @inject(InjectTokens.DeployExplorerStep) private readonly explorerStep: DeployExplorerStep,
    @inject(InjectTokens.DeployRelayStep) private readonly relayStep: DeployRelayStep,
  ) {
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.blockNodeStep = patchInject(blockNodeStep, InjectTokens.DeployBlockNodeStep, this.constructor.name);
    this.networkPipelineStep = patchInject(
      networkPipelineStep,
      InjectTokens.DeployNetworkPipelineStep,
      this.constructor.name,
    );
    this.mirrorNodeStep = patchInject(mirrorNodeStep, InjectTokens.DeployMirrorNodeStep, this.constructor.name);
    this.explorerStep = patchInject(explorerStep, InjectTokens.DeployExplorerStep, this.constructor.name);
    this.relayStep = patchInject(relayStep, InjectTokens.DeployRelayStep, this.constructor.name);
  }

  public buildDeployTaskList(
    config: OneShotSingleDeployConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): SoloListr<OneShotSingleDeployContext> {
    const phases: Array<Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>> = [
      new Phase(`solo ${BlockCommandDefinition.ADD_COMMAND}`, this.blockNodeStep),
      new Phase('Deploy network node', this.networkPipelineStep),
      new Phase(`solo ${MirrorCommandDefinition.ADD_COMMAND}`, this.mirrorNodeStep),
      new Phase(`solo ${ExplorerCommandDefinition.ADD_COMMAND}`, this.explorerStep).withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
      ),
      new Phase(`solo ${RelayCommandDefinition.ADD_COMMAND}`, this.relayStep)
        .withWaitCondition(SoloEventType.MirrorNodeDeployed)
        .withWaitCondition(SoloEventType.NodesStarted),
    ];

    return parentTask.newListr(
      phases.map(
        (
          phase: Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>,
        ): SoloListrTask<OneShotSingleDeployContext> => phase.asListrTask(config, this.eventBus),
      ),
      {concurrent: config.parallelDeploy, rendererOptions: {collapseSubtasks: false}},
    );
  }
}
