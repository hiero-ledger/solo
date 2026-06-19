// SPDX-License-Identifier: Apache-2.0

import {DEPLOYMENT_PHASE_ORDER, type DeploymentPhase} from './deployment-phase.js';

export class DeploymentPhaseHelper {
  /**
   * Returns true when {@link phase} is at or beyond {@link minimumPhase} in the deployment
   * progression defined by {@link DEPLOYMENT_PHASE_ORDER}.
   */
  public static isDeploymentPhaseAtLeast(phase: DeploymentPhase, minimumPhase: DeploymentPhase): boolean {
    return DEPLOYMENT_PHASE_ORDER[phase] >= DEPLOYMENT_PHASE_ORDER[minimumPhase];
  }
}

export const isDeploymentPhaseAtLeast: (phase: DeploymentPhase, minimumPhase: DeploymentPhase) => boolean =
  DeploymentPhaseHelper.isDeploymentPhaseAtLeast;
