// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {NetworkNodeLifecycle} from '../../../src/core/network-node-lifecycle.js';

describe('NetworkNodeLifecycle', (): void => {
  const soloContainer: string = NetworkNodeLifecycle.SOLO_CONTAINER_MODE;
  const consensusNodeImage: string = NetworkNodeLifecycle.CONSENSUS_NODE_IMAGE_MODE;

  it('should only select the consensus node image mode for its exact value', (): void => {
    expect(NetworkNodeLifecycle.isConsensusNodeImage(consensusNodeImage)).to.equal(true);
    expect(NetworkNodeLifecycle.isConsensusNodeImage(soloContainer)).to.equal(false);
    expect(NetworkNodeLifecycle.isConsensusNodeImage('')).to.equal(false);
  });

  it('should use the solo-container helper in the default mode', (): void => {
    const start: string = NetworkNodeLifecycle.buildStartCommand(soloContainer);
    expect(start).to.contain('/command/network-node-lifecycle" start-and-enable-autostart');
    expect(start).to.contain('enable-autostart; exit 0');
    expect(start).to.not.contain('s6-svc');
    expect(NetworkNodeLifecycle.buildStopCommand(soloContainer)).to.contain('stop-and-disable-autostart');
    expect(NetworkNodeLifecycle.buildDisableAutostartCommand(soloContainer)).to.contain('disable-autostart');
  });

  it('should drive the s6 consensus service in the consensus node image mode', (): void => {
    const start: string = NetworkNodeLifecycle.buildStartCommand(consensusNodeImage);
    expect(start).to.contain('/command/s6-svc" -wD -T 60000 -d "/run/service/consensus"');
    expect(start).to.contain('/command/s6-svc" -o "/run/service/consensus"');
    expect(start).to.not.contain('network-node-lifecycle');

    const stop: string = NetworkNodeLifecycle.buildStopCommand(consensusNodeImage);
    expect(stop).to.contain('/command/s6-svc" -wD -T 60000 -d "/run/service/consensus"');
    expect(stop).to.not.contain('network-node-lifecycle');

    expect(NetworkNodeLifecycle.buildDisableAutostartCommand(consensusNodeImage)).to.equal('true');
  });
});
