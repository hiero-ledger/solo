// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {
  DeploymentPhase,
  DEPLOYMENT_PHASE_ORDER,
} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';
import {isDeploymentPhaseAtLeast} from '../../../../../../src/data/schema/model/remote/deployment-phase-helper.js';

describe('deployment-phase', (): void => {
  describe('DEPLOYMENT_PHASE_ORDER', (): void => {
    it('ranks every DeploymentPhase value', (): void => {
      for (const phase of Object.values(DeploymentPhase)) {
        expect(DEPLOYMENT_PHASE_ORDER[phase]).to.be.a('number');
      }
    });

    it('orders REQUESTED below DEPLOYED', (): void => {
      expect(DEPLOYMENT_PHASE_ORDER[DeploymentPhase.REQUESTED]).to.be.lessThan(
        DEPLOYMENT_PHASE_ORDER[DeploymentPhase.DEPLOYED],
      );
    });
  });

  describe('isDeploymentPhaseAtLeast', (): void => {
    it('returns false when the phase is below the minimum', (): void => {
      expect(isDeploymentPhaseAtLeast(DeploymentPhase.REQUESTED, DeploymentPhase.DEPLOYED)).to.be.false;
    });

    it('returns true when the phase equals the minimum', (): void => {
      expect(isDeploymentPhaseAtLeast(DeploymentPhase.DEPLOYED, DeploymentPhase.DEPLOYED)).to.be.true;
    });

    it('returns true when the phase is beyond the minimum', (): void => {
      expect(isDeploymentPhaseAtLeast(DeploymentPhase.STARTED, DeploymentPhase.DEPLOYED)).to.be.true;
      expect(isDeploymentPhaseAtLeast(DeploymentPhase.FROZEN, DeploymentPhase.DEPLOYED)).to.be.true;
    });
  });
});
