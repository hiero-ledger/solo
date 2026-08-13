// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientPods} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';
import {KubePodNotFoundError} from '../../../../src/integration/kube/errors/kube-pod-not-found-error.js';
import {KubePodNotReadyError} from '../../../../src/integration/kube/errors/kube-pod-not-ready-error.js';
import {KubePodReadinessFailedError} from '../../../../src/integration/kube/errors/kube-pod-readiness-failed-error.js';
import {KubeErrorTranslator} from '../../../../src/core/errors/kube-error-translator.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloError} from '../../../../src/core/errors/solo-error.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

interface RawPodFixture {
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly creationTimestamp: Date;
  };
  readonly spec: {
    readonly containers: {readonly name: string}[];
  };
  readonly status: {
    phase?: string;
    readonly containerStatuses: object[];
  };
}

/** A pod that exists and is Running but whose container never becomes ready (e.g. a failing startup probe). */
function buildUnreadyRunningPod(): RawPodFixture {
  return {
    metadata: {
      name: 'relay-1-bc544d79d-vkmgq',
      namespace: 'solo',
      creationTimestamp: new Date(),
    },
    spec: {
      containers: [{name: 'relay'}],
    },
    status: {
      phase: 'Running',
      containerStatuses: [{name: 'relay', ready: false, restartCount: 2}],
    },
  };
}

describe('K8ClientPods wait timeout errors', (): void => {
  let listNamespacedPodStub: SinonStub;
  let pods: K8ClientPods;

  beforeEach((): void => {
    resetForTest();
    listNamespacedPodStub = sinon.stub();
    pods = new K8ClientPods({listNamespacedPod: listNamespacedPodStub} as never, {} as never, '');
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('waitForReadyStatus reports the observed pod when it exists but never becomes ready', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildUnreadyRunningPod()]});

    try {
      await pods.waitForReadyStatus(NamespaceName.of('solo'), ['app.kubernetes.io/name=relay'], 3, 0);
      expect.fail('Expected waitForReadyStatus to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodReadinessFailedError);
      const cause: KubePodNotReadyError = (error as KubePodReadinessFailedError).cause as KubePodNotReadyError;
      expect(cause).to.be.instanceOf(KubePodNotReadyError);
      expect(cause.message).to.not.include('No pod found');
      expect(cause.message).to.include('relay-1-bc544d79d-vkmgq');
      expect(cause.message).to.include('phase: Running');
      expect(cause.message).to.include('relay (ready: false, restarts: 2)');
    }
    expect(listNamespacedPodStub).to.have.callCount(3);
  });

  it('waitForRunningPhase still reports KubePodNotFoundError when no pod ever matches the labels', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: []});

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app=missing'], 3, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotFoundError);
      expect((error as KubePodNotFoundError).message).to.include('No pod found for: labels:app=missing');
    }
  });

  it('waitForRunningPhase reports the last observed pod even if it later disappears', async (): Promise<void> => {
    listNamespacedPodStub.onFirstCall().resolves({items: [buildUnreadyRunningPod()]});
    listNamespacedPodStub.resolves({items: []});

    try {
      await pods.waitForRunningPhase(
        NamespaceName.of('solo'),
        ['app.kubernetes.io/name=relay'],
        3,
        0,
        (): boolean => false,
      );
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotReadyError);
      expect((error as KubePodNotReadyError).podName).to.equal('relay-1-bc544d79d-vkmgq');
    }
  });

  it('KubeErrorTranslator maps KubePodNotReadyError to PodNotReadySoloError with the pod details', (): void => {
    const kubeError: KubePodNotReadyError = new KubePodNotReadyError('labels:app=relay', 'relay-1-x', 'Running', [
      {name: 'relay', ready: false, restartCount: 2, waitingReason: 'CrashLoopBackOff'},
    ]);

    const translated: SoloError | undefined = KubeErrorTranslator.tryTranslate(kubeError);

    expect(translated).to.be.instanceOf(SoloErrors.system.podNotReady);
    expect(translated.message).to.include('relay-1-x');
    expect(translated.message).to.include('phase: Running');
    expect(translated.message).to.include('waiting: CrashLoopBackOff');
  });
});
