// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type SoloEventBus} from '../../../core/events/solo-event-bus.js';
import {SoloEventType} from '../../../core/events/event-types/event-types.js';
import {type MirrorNodeDeployedEvent} from '../../../core/events/event-types/mirror-node-deployed-event.js';
import {type NodesStartedEvent} from '../../../core/events/event-types/nodes-started-event.js';
import {Duration} from '../../../core/time/duration.js';
import {type SoloListr, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type ArgvStruct} from '../../../types/aliases.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';
import {type OneShotDeployOrchestrator} from './one-shot-deploy-orchestrator.js';
import {DeployBlockNodeStep} from './deploy-block-node-step.js';
import {DeployNetworkPipelineStep} from './deploy-network-pipeline-step.js';
import {DeployMirrorNodeStep} from './deploy-mirror-node-step.js';
import {DeployExplorerStep} from './deploy-explorer-step.js';
import {DeployRelayStep} from './deploy-relay-step.js';
import {ExplorerCommandDefinition} from '../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../command-definitions/relay-command-definition.js';

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
    argv: ArgvStruct,
    parentTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): SoloListr<OneShotSingleDeployContext> {
    return parentTask.newListr(
      [
        // Phase 1: independent deployments that can run concurrently
        this.blockNodeStep.asListrTask(config),
        this.networkPipelineStep.asListrTask(config, argv),
        this.mirrorNodeStep.asListrTask(config),
        // Phase 2: explorer — requires mirror node to be deployed first
        {
          title: `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
          skip: (): boolean => !config.deployExplorer && !config.minimalSetup,
          task: async (
            _: OneShotSingleDeployContext,
            explorerTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<SoloListr<OneShotSingleDeployContext>> => {
            await this.eventBus.waitFor(
              SoloEventType.MirrorNodeDeployed,
              (soloEvent: MirrorNodeDeployedEvent): boolean => soloEvent.deployment === config.deployment,
              Duration.ofMinutes(5),
            );
            return explorerTask.newListr([this.explorerStep.asListrTask(config)]);
          },
        },
        // Phase 3: relay — requires both mirror node and consensus nodes to be running
        {
          title: `solo ${RelayCommandDefinition.ADD_COMMAND}`,
          skip: (): boolean => !config.deployRelay && !config.minimalSetup,
          task: async (
            _: OneShotSingleDeployContext,
            relayTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<SoloListr<OneShotSingleDeployContext>> => {
            await this.eventBus.waitFor(
              SoloEventType.MirrorNodeDeployed,
              (soloEvent: MirrorNodeDeployedEvent): boolean => soloEvent.deployment === config.deployment,
              Duration.ofMinutes(5),
            );
            await this.eventBus.waitFor(
              SoloEventType.NodesStarted,
              (soloEvent: NodesStartedEvent): boolean => soloEvent.deployment === config.deployment,
              Duration.ofMinutes(5),
            );
            return relayTask.newListr([this.relayStep.asListrTask(config)]);
          },
        },
      ],
      {concurrent: config.parallelDeploy, rendererOptions: {collapseSubtasks: false}},
    );
  }
}
