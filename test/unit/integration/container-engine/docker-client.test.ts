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
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
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
    DockerClientTestBuilder.stubMissingPodmanContainer(shellRunnerRunStub, 'solo-cluster-control-plane');
    shellRunnerRunStub
      .withArgs('docker', DockerClientTestBuilder.listImagesArguments('solo-cluster-control-plane'))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('solo-cluster');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledWithExactly(
      'docker',
      DockerClientTestBuilder.listImagesArguments('solo-cluster-control-plane'),
    );
  });

  it('uses podman to list images loaded into a podman-backed kind cluster', async (): Promise<void> => {
    process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .resolves([]);
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.listImagesArguments('kind-control-plane'))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('kind');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledWithExactly(
      'podman',
      DockerClientTestBuilder.listImagesArguments('kind-control-plane'),
    );
  });

  it('detects a podman-backed kind cluster even when the provider environment variable is absent', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .resolves([]);
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.listImagesArguments('kind-control-plane'))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('kind');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledWithExactly(
      'podman',
      DockerClientTestBuilder.listImagesArguments('kind-control-plane'),
    );
  });

  it('uses sudo podman to list images for a rootful podman-backed kind cluster', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .rejects(new Error('missing rootful container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        DockerClientTestBuilder.containerExistsArguments('kind-control-plane', ['-n', 'podman']),
        sinon.match.object,
      )
      .resolves([]);
    shellRunnerRunStub
      .withArgs('sudo', DockerClientTestBuilder.listImagesArguments('kind-control-plane', ['-n', 'podman']))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('kind');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.have.been.calledWithExactly(
      'sudo',
      DockerClientTestBuilder.listImagesArguments('kind-control-plane', ['-n', 'podman']),
    );
  });

  it('loads image archives into a podman-backed kind cluster with the podman kind provider', async (): Promise<void> => {
    const kindExecutable: string = '/home/runner/.solo/bin/kind';
    const dependencyManager: DependencyManager = DockerClientTestBuilder.buildDependencyManager(kindExecutable);
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .resolves([]);
    shellRunnerRunStub
      .withArgs(
        kindExecutable,
        DockerClientTestBuilder.loadImageArchiveArguments('/tmp/busybox.tar', 'kind'),
        sinon.match.object,
      )
      .resolves([]);

    const client: DockerClient = DockerClientTestBuilder.build(dependencyManager);
    await client.loadImageArchiveIntoCluster('/tmp/busybox.tar', 'kind');

    expect(shellRunnerRunStub).to.have.been.calledWith(
      kindExecutable,
      DockerClientTestBuilder.loadImageArchiveArguments('/tmp/busybox.tar', 'kind'),
      sinon.match.hasNested('environmentVariablesToAppend.KIND_EXPERIMENTAL_PROVIDER', 'podman'),
    );
  });

  it('loads image archives into a rootful podman-backed kind cluster with sudo', async (): Promise<void> => {
    const kindExecutable: string = '/home/runner/.solo/bin/kind';
    const dependencyManager: DependencyManager = DockerClientTestBuilder.buildDependencyManager(kindExecutable);
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .rejects(new Error('missing rootful container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        DockerClientTestBuilder.containerExistsArguments('kind-control-plane', ['-n', 'podman']),
        sinon.match.object,
      )
      .resolves([]);
    shellRunnerRunStub
      .withArgs(
        'sudo',
        DockerClientTestBuilder.sudoKindLoadImageArchiveArguments(kindExecutable, '/tmp/busybox.tar', 'kind'),
      )
      .resolves([]);

    const client: DockerClient = DockerClientTestBuilder.build(dependencyManager);
    await client.loadImageArchiveIntoCluster('/tmp/busybox.tar', 'kind');

    expect(shellRunnerRunStub).to.have.been.calledWith(
      'sudo',
      DockerClientTestBuilder.sudoKindLoadImageArchiveArguments(kindExecutable, '/tmp/busybox.tar', 'kind'),
    );
  });
});

class DockerClientTestBuilder {
  public static build(dependencyManager: DependencyManager = {} as DependencyManager): DockerClient {
    return new DockerClient({} as DefaultKindClientBuilder, {} as SoloLogger, dependencyManager);
  }

  public static buildDependencyManager(kindExecutable: string): DependencyManager {
    return {
      getExecutable: async (): Promise<string> => kindExecutable,
    } as unknown as DependencyManager;
  }

  public static containerExistsArguments(nodeName: string, prefix: readonly string[] = []): string[] {
    return [...prefix, 'container', 'exists', nodeName];
  }

  public static listImagesArguments(nodeName: string, prefix: readonly string[] = []): string[] {
    return [...prefix, 'exec', '--privileged', nodeName, 'ctr', '--namespace=k8s.io', 'images', 'ls', '-q'];
  }

  public static loadImageArchiveArguments(archivePath: string, clusterName: string): string[] {
    return ['load', 'image-archive', archivePath, '--name', clusterName];
  }

  public static sudoKindLoadImageArchiveArguments(
    kindExecutable: string,
    archivePath: string,
    clusterName: string,
  ): string[] {
    return [
      '-n',
      'env',
      'KIND_EXPERIMENTAL_PROVIDER=podman',
      sinon.match.string as unknown as string,
      kindExecutable,
      ...DockerClientTestBuilder.loadImageArchiveArguments(archivePath, clusterName),
    ];
  }

  public static stubMissingPodmanContainer(shellRunnerRunStub: SinonStub, nodeName: string): void {
    shellRunnerRunStub
      .withArgs('podman', DockerClientTestBuilder.containerExistsArguments(nodeName), sinon.match.object)
      .rejects(new Error('missing podman container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        DockerClientTestBuilder.containerExistsArguments(nodeName, ['-n', 'podman']),
        sinon.match.object,
      )
      .rejects(new Error('missing rootful podman container'));
  }
}
