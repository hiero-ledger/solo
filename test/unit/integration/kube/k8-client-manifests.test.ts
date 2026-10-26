// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {K8ClientManifests} from '../../../../src/integration/kube/k8-client/resources/manifest/k8-client-manifests.js';

describe('K8ClientManifests.patchObject', (): void => {
  it('retries on a dropped TLS connection and then succeeds', async (): Promise<void> => {
    const patch: sinon.SinonStub = sinon.stub();
    patch.onFirstCall().rejects(new Error('Client network socket disconnected before secure TLS connection'));
    patch.onSecondCall().resolves({});
    const manifests: K8ClientManifests = new K8ClientManifests({patch} as unknown as ConstructorParameters<
      typeof K8ClientManifests
    >[0]);

    await manifests.patchObject({kind: 'ServiceMonitor'});

    expect(patch.callCount).to.equal(2);
  });

  it('does not retry non-transient errors', async (): Promise<void> => {
    const patch: sinon.SinonStub = sinon.stub().rejects(new Error('Forbidden'));
    const manifests: K8ClientManifests = new K8ClientManifests({patch} as unknown as ConstructorParameters<
      typeof K8ClientManifests
    >[0]);

    let thrown: Error | undefined;
    try {
      await manifests.patchObject({kind: 'ServiceMonitor'});
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).to.equal('Forbidden');
    expect(patch.callCount).to.equal(1);
  });
});
