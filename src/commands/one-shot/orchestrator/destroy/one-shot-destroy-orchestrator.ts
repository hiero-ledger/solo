// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {type OrchestratorPipeline} from '../orchestrator-pipeline.js';

/**
 * Interface for the One-Shot Destroy Orchestrator, responsible for building the destruction pipeline for one-shot destroy commands.
 */
export interface OneShotDestroyOrchestrator {
  /**
   * Builds the destruction pipeline for a one-shot destroy command.
   * @param argv
   * @param flagsList
   * @param leaseReference
   * @param skipDeploymentLock - when true, the deployment-lock phase is skipped because the caller
   *   (for example one-shot deploy's auto-clean step) already owns the lock for this deployment.
   */
  buildDestroyPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
    skipDeploymentLock?: boolean,
  ): OrchestratorPipeline<OneShotSingleDestroyContext>;
}
