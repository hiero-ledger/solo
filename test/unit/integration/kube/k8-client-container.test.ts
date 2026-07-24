// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientContainer} from '../../../../src/integration/kube/k8-client/resources/container/k8-client-container.js';
import {KubeContainerOperationFailedError} from '../../../../src/integration/kube/errors/kube-container-operation-failed-error.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {type Pods} from '../../../../src/integration/kube/resources/pod/pods.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

function kubectlFailure(stderr: string): KubeContainerOperationFailedError {
  return new KubeContainerOperationFailedError(
    'container call: kubectl exec test-pod, failed with code 1',
    new Error(stderr),
  );
}

describe('K8ClientContainer execContainer', (): void => {
  const containerReference: ContainerReference = ContainerReference.of(
    PodReference.of(NamespaceName.of('test-namespace'), PodName.of('test-pod')),
    ContainerName.of('test-container'),
  );

  let containerClient: K8ClientContainer;
  let execKubectlStub: SinonStub;

  beforeEach((): void => {
    resetForTest();
    const pods: Pods = {waitForPodByReference: sinon.stub().resolves({})} as unknown as Pods;
    containerClient = new K8ClientContainer(
      {getCurrentContext: (): string => 'test-context'} as never,
      containerReference,
      pods,
      '',
    );
    execKubectlStub = sinon.stub(containerClient, 'execKubectl' as never);
  });

  afterEach((): void => {
    sinon.restore();
  });

  for (const stderr of [
    'error: Internal error occurred: Timeout occurred',
    'Error from server: error dialing backend: dial tcp 10.89.0.2:10250: connect: connection refused',
    'error: unable to upgrade connection: container not found ("postgresql")',
  ]) {
    it(`retries and succeeds after transient failure: ${stderr}`, async (): Promise<void> => {
      execKubectlStub.onFirstCall().rejects(kubectlFailure(stderr));
      execKubectlStub.onSecondCall().resolves('ok');

      const result: string = await containerClient.execContainer('chmod +x /tmp/init-postgres.sh');

      expect(result).to.equal('ok');
      expect(execKubectlStub).to.have.been.calledTwice;
    });
  }

  it('does not retry a non-transient failure', async (): Promise<void> => {
    const failure: KubeContainerOperationFailedError = kubectlFailure(
      "chmod: cannot access '/tmp/missing.sh': No such file or directory",
    );
    execKubectlStub.rejects(failure);

    try {
      await containerClient.execContainer('chmod +x /tmp/missing.sh');
      expect.fail('Expected execContainer to reject');
    } catch (error) {
      expect(error).to.equal(failure);
    }

    expect(execKubectlStub).to.have.been.calledOnce;
  });
});
