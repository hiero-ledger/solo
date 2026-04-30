// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {
  V1Pod,
  V1PodStatus,
  V1ContainerStatus,
  V1ContainerState,
  V1ContainerStateWaiting,
  V1ContainerStateTerminated,
  V1ContainerStateRunning,
  V1ObjectMeta,
} from '@kubernetes/client-node';
import {detectFatalContainerError} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';

function buildPodWithContainerStatus(containerStatus: V1ContainerStatus): V1Pod {
  const pod: V1Pod = new V1Pod();
  pod.metadata = new V1ObjectMeta();
  pod.metadata.name = 'test-pod';
  pod.status = new V1PodStatus();
  pod.status.containerStatuses = [containerStatus];
  return pod;
}

function buildPodWithInitContainerStatus(containerStatus: V1ContainerStatus): V1Pod {
  const pod: V1Pod = new V1Pod();
  pod.metadata = new V1ObjectMeta();
  pod.metadata.name = 'test-pod';
  pod.status = new V1PodStatus();
  pod.status.initContainerStatuses = [containerStatus];
  return pod;
}

function buildWaitingContainerStatus(reason: string, message?: string): V1ContainerStatus {
  const waiting: V1ContainerStateWaiting = new V1ContainerStateWaiting();
  waiting.reason = reason;
  waiting.message = message;

  const state: V1ContainerState = new V1ContainerState();
  state.waiting = waiting;

  const containerStatus: V1ContainerStatus = new V1ContainerStatus();
  containerStatus.name = 'test-container';
  containerStatus.state = state;
  return containerStatus;
}

function buildTerminatedContainerStatus(reason: string, exitCode: number): V1ContainerStatus {
  const terminated: V1ContainerStateTerminated = new V1ContainerStateTerminated();
  terminated.reason = reason;
  terminated.exitCode = exitCode;

  const state: V1ContainerState = new V1ContainerState();
  state.terminated = terminated;

  const containerStatus: V1ContainerStatus = new V1ContainerStatus();
  containerStatus.name = 'test-container';
  containerStatus.state = state;
  return containerStatus;
}

describe('detectFatalContainerError', (): void => {
  it('should return undefined for a pod with no container statuses', (): void => {
    const pod: V1Pod = new V1Pod();
    pod.metadata = new V1ObjectMeta();
    pod.metadata.name = 'empty-pod';
    pod.status = new V1PodStatus();
    expect(detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should return undefined for a pod with a healthy running container', (): void => {
    const running: V1ContainerStateRunning = new V1ContainerStateRunning();
    running.startedAt = new Date();

    const state: V1ContainerState = new V1ContainerState();
    state.running = running;

    const containerStatus: V1ContainerStatus = new V1ContainerStatus();
    containerStatus.name = 'healthy-container';
    containerStatus.state = state;

    const pod: V1Pod = buildPodWithContainerStatus(containerStatus);
    expect(detectFatalContainerError(pod)).to.be.undefined;
  });

  for (const reason of [
    'ImagePullBackOff',
    'ErrImagePull',
    'InvalidImageName',
    'ImageInspectError',
    'RegistryUnavailable',
  ]) {
    it(`should detect fatal waiting reason: ${reason}`, (): void => {
      const pod: V1Pod = buildPodWithContainerStatus(buildWaitingContainerStatus(reason));
      const result: string | undefined = detectFatalContainerError(pod);
      expect(result).to.include(reason);
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });
  }

  it('should include message detail when present for ImagePullBackOff', (): void => {
    const message: string = 'failed to pull image "gcr.io/example/app:0.1.0-SNAPSHOT": not found';
    const pod: V1Pod = buildPodWithContainerStatus(buildWaitingContainerStatus('ImagePullBackOff', message));
    const result: string | undefined = detectFatalContainerError(pod);
    expect(result).to.include(message);
  });

  it('should return undefined for a non-fatal waiting reason (e.g. ContainerCreating)', (): void => {
    const pod: V1Pod = buildPodWithContainerStatus(buildWaitingContainerStatus('ContainerCreating'));
    expect(detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect OOMKilled terminated reason', (): void => {
    const pod: V1Pod = buildPodWithContainerStatus(buildTerminatedContainerStatus('OOMKilled', 137));
    const result: string | undefined = detectFatalContainerError(pod);
    expect(result).to.include('OOMKilled');
    expect(result).to.include('137');
  });

  it('should return undefined for a non-fatal terminated reason (e.g. Completed)', (): void => {
    const pod: V1Pod = buildPodWithContainerStatus(buildTerminatedContainerStatus('Completed', 0));
    expect(detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect fatal error in init container status', (): void => {
    const pod: V1Pod = buildPodWithInitContainerStatus(buildWaitingContainerStatus('ImagePullBackOff'));
    const result: string | undefined = detectFatalContainerError(pod);
    expect(result).to.include('ImagePullBackOff');
  });

  it('should use <unknown> for pod and container name when metadata is absent', (): void => {
    const pod: V1Pod = new V1Pod();
    pod.status = new V1PodStatus();
    const containerStatus: V1ContainerStatus = new V1ContainerStatus();
    const state: V1ContainerState = new V1ContainerState();
    const waiting: V1ContainerStateWaiting = new V1ContainerStateWaiting();
    waiting.reason = 'ImagePullBackOff';
    state.waiting = waiting;
    containerStatus.state = state;
    pod.status.containerStatuses = [containerStatus];

    const result: string | undefined = detectFatalContainerError(pod);
    expect(result).to.include('<unknown>');
  });
});
