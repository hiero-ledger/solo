// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type SoloEventBus} from '../../../../core/events/solo-event-bus.js';
import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type OneShotDestroyOrchestrator} from './one-shot-destroy-orchestrator.js';
import {DestroyExplorerStep} from './destroy-explorer-step.js';
import {DestroyRelayStep} from './destroy-relay-step.js';
import {DestroyMirrorNodeStep} from './destroy-mirror-node-step.js';
import {DestroyBlockNodeStep} from './destroy-block-node-step.js';
import {DestroyConsensusNodeStep} from './destroy-consensus-node-step.js';
import {ClusterResetStep} from './cluster-reset-step.js';
import {ClusterDisconnectStep} from './cluster-disconnect-step.js';
import {DeploymentDeleteStep} from './deployment-delete-step.js';
import {Phase} from '../phase.js';

@injectable()
export class DefaultOneShotDestroyOrchestrator implements OneShotDestroyOrchestrator {
  public constructor(
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.DestroyExplorerStep) private readonly destroyExplorerStep: DestroyExplorerStep,
    @inject(InjectTokens.DestroyRelayStep) private readonly destroyRelayStep: DestroyRelayStep,
    @inject(InjectTokens.DestroyMirrorNodeStep) private readonly destroyMirrorNodeStep: DestroyMirrorNodeStep,
    @inject(InjectTokens.DestroyBlockNodeStep) private readonly destroyBlockNodeStep: DestroyBlockNodeStep,
    @inject(InjectTokens.DestroyConsensusNodeStep)
    private readonly destroyConsensusNodeStep: DestroyConsensusNodeStep,
    @inject(InjectTokens.ClusterResetStep) private readonly clusterResetStep: ClusterResetStep,
    @inject(InjectTokens.ClusterDisconnectStep) private readonly clusterDisconnectStep: ClusterDisconnectStep,
    @inject(InjectTokens.DeploymentDeleteStep) private readonly deploymentDeleteStep: DeploymentDeleteStep,
  ) {
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.destroyExplorerStep = patchInject(
      destroyExplorerStep,
      InjectTokens.DestroyExplorerStep,
      this.constructor.name,
    );
    this.destroyRelayStep = patchInject(destroyRelayStep, InjectTokens.DestroyRelayStep, this.constructor.name);
    this.destroyMirrorNodeStep = patchInject(
      destroyMirrorNodeStep,
      InjectTokens.DestroyMirrorNodeStep,
      this.constructor.name,
    );
    this.destroyBlockNodeStep = patchInject(
      destroyBlockNodeStep,
      InjectTokens.DestroyBlockNodeStep,
      this.constructor.name,
    );
    this.destroyConsensusNodeStep = patchInject(
      destroyConsensusNodeStep,
      InjectTokens.DestroyConsensusNodeStep,
      this.constructor.name,
    );
    this.clusterResetStep = patchInject(clusterResetStep, InjectTokens.ClusterResetStep, this.constructor.name);
    this.clusterDisconnectStep = patchInject(
      clusterDisconnectStep,
      InjectTokens.ClusterDisconnectStep,
      this.constructor.name,
    );
    this.deploymentDeleteStep = patchInject(
      deploymentDeleteStep,
      InjectTokens.DeploymentDeleteStep,
      this.constructor.name,
    );
  }

  public buildDestroyTaskList(
    config: OneShotSingleDestroyConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
  ): SoloListr<OneShotSingleDestroyContext> {
    const phases: Array<Phase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>> = [
      Phase.composite(
        'Destroy extended setup',
        [new Phase('Destroy explorer', this.destroyExplorerStep), new Phase('Destroy relay', this.destroyRelayStep)],
        'concurrent',
        false,
      ),
      new Phase('Destroy mirror node', this.destroyMirrorNodeStep),
      new Phase('Destroy block node', this.destroyBlockNodeStep),
      new Phase('Destroy consensus node', this.destroyConsensusNodeStep),
      new Phase('Cluster reset', this.clusterResetStep),
      new Phase('Cluster disconnect', this.clusterDisconnectStep),
      new Phase('Deployment delete', this.deploymentDeleteStep),
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
