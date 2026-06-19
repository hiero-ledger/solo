// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type ContainerStatus} from '../../../../src/integration/kube/resources/pod/container-status.js';
import {K8ClientPods} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';
import {resetForTest} from '../../../test-container.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

function buildPod(containerStatuses: ContainerStatus[], podName: string = 'test-pod'): Pod {
  return {
    podReference: PodReference.of(NamespaceName.of('default'), PodName.of(podName)),
    allContainerStatuses: containerStatuses,
    killPod: async (): Promise<void> => {},
    portForward: async (): Promise<number> => 0,
    stopPortForward: async (): Promise<void> => {},
  };
}

function buildPodWithoutReference(containerStatuses: ContainerStatus[]): Pod {
  return {
    // eslint-disable-next-line unicorn/no-null
    podReference: null,
    allContainerStatuses: containerStatuses,
    killPod: async (): Promise<void> => {},
    portForward: async (): Promise<number> => 0,
    stopPortForward: async (): Promise<void> => {},
  };
}

function buildWaiting(containerName: string, reason: string, message?: string): ContainerStatus {
  return {name: containerName, waitingReason: reason, waitingMessage: message};
}

function buildTerminated(containerName: string, reason: string, exitCode: number): ContainerStatus {
  return {name: containerName, terminatedReason: reason, terminatedExitCode: exitCode};
}

describe('detectFatalContainerError', (): void => {
  let podsClient: K8ClientPods;

  before((): void => {
    resetForTest();
    // detectFatalContainerError does not use the K8s client or config; pass undefined for test setup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    podsClient = new K8ClientPods(undefined as any, undefined as any, '');
  });

  it('should return undefined for a pod with no container statuses', (): void => {
    const pod: Pod = buildPod([]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should return undefined for a pod with a healthy running container', (): void => {
    const pod: Pod = buildPod([{name: 'healthy-container'}]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  for (const reason of ['InvalidImageName', 'RegistryUnavailable']) {
    it(`should detect fatal waiting reason: ${reason}`, (): void => {
      const pod: Pod = buildPod([buildWaiting('test-container', reason)]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.include(reason);
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });
  }

  for (const reason of ['ImagePullBackOff', 'ErrImagePull', 'ImageInspectError']) {
    it(`should detect fatal waiting reason when message is non-recoverable: ${reason}`, (): void => {
      const message: string = 'failed to pull image "ghcr.io/example/app:1.2.3": not found';
      const pod: Pod = buildPod([buildWaiting('test-container', reason, message)]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.include(reason);
      expect(result).to.include(message);
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });
  }

  it('should include message detail when present for ImagePullBackOff', (): void => {
    const message: string = 'failed to pull image "gcr.io/example/app:0.1.0-SNAPSHOT": not found';
    const pod: Pod = buildPod([buildWaiting('test-container', 'ImagePullBackOff', message)]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include(message);
  });

  it('should return undefined for a non-fatal waiting reason (e.g. ContainerCreating)', (): void => {
    const pod: Pod = buildPod([buildWaiting('test-container', 'ContainerCreating')]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect OOMKilled terminated reason', (): void => {
    const pod: Pod = buildPod([buildTerminated('test-container', 'OOMKilled', 137)]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('OOMKilled');
    expect(result).to.include('137');
  });

  it('should return undefined for a non-fatal terminated reason (e.g. Completed)', (): void => {
    const pod: Pod = buildPod([buildTerminated('test-container', 'Completed', 0)]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect fatal error across multiple container statuses (init container first)', (): void => {
    const pod: Pod = buildPod([
      buildWaiting('init-container', 'ImagePullBackOff', 'manifest unknown'),
      {name: 'main-container'},
    ]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('ImagePullBackOff');
    expect(result).to.include('"init-container"');
  });

  it('should use <unknown> for pod name when podReference is null', (): void => {
    const pod: Pod = buildPodWithoutReference([buildWaiting('<unknown>', 'ImagePullBackOff', 'not found')]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('<unknown>');
  });
});
