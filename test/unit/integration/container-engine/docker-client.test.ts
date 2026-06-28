// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {DockerClient} from '../../../../src/integration/container-engine/docker-client.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {type DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type DependencyManager} from '../../../../src/core/dependency-managers/index.js';

describe('DockerClient', (): void => {
  let previousKindProvider: string | undefined;
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    previousKindProvider = process.env.KIND_EXPERIMENTAL_PROVIDER;
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run').resolves(['docker.io/library/busybox:latest']);
  });

  afterEach((): void => {
    sandbox.restore();

    if (previousKindProvider === undefined) {
      delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    } else {
      process.env.KIND_EXPERIMENTAL_PROVIDER = previousKindProvider;
    }
  });

  it('uses docker to list images loaded into a kind cluster by default', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('solo-cluster');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledOnceWithExactly('docker', [
      'exec',
      '--privileged',
      'solo-cluster-control-plane',
      'ctr',
      '--namespace=k8s.io',
      'images',
      'ls',
      '-q',
    ]);
  });

  it('uses podman to list images loaded into a podman-backed kind cluster', async (): Promise<void> => {
    process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('kind');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledOnceWithExactly('podman', [
      'exec',
      '--privileged',
      'kind-control-plane',
      'ctr',
      '--namespace=k8s.io',
      'images',
      'ls',
      '-q',
    ]);
  });
});

class DockerClientTestBuilder {
  public static build(): DockerClient {
    return new DockerClient({} as DefaultKindClientBuilder, {} as SoloLogger, {} as DependencyManager);
  }
}
