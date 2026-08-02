// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {DockerClient} from '../../../../src/integration/container-engine/docker-client.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {SubprocessCommandProfile} from '../../../../src/core/subprocess-command-profile.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type DependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {type KindClient} from '../../../../src/integration/kind/kind-client.js';
import {PodmanDependencyManager} from '../../../../src/core/dependency-managers/podman-dependency-manager.js';

describe('DockerClient', (): void => {
  let previousKindProvider: string | undefined;
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    previousKindProvider = process.env.KIND_EXPERIMENTAL_PROVIDER;
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
    // Pin the host-dependent container configuration lookup so command shapes are deterministic.
    sandbox.stub(PodmanDependencyManager.prototype, 'containerConfigEnvironment').returns({});
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
    shellRunnerRunStub
      .withArgs(
        'docker',
        DockerClientTestBuilder.containerExistsArguments('solo-cluster-control-plane'),
        sinon.match.object,
      )
      .resolves([]);
    shellRunnerRunStub
      .withArgs('docker', DockerClientTestBuilder.listImagesArguments('solo-cluster-control-plane'))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    const images: readonly string[] = await client.listLoadedImagesInCluster('solo-cluster');

    expect(images).to.deep.equal(['docker.io/library/busybox:latest']);
    expect(shellRunnerRunStub).to.not.have.been.calledWith('podman', sinon.match.any, sinon.match.any);
    expect(shellRunnerRunStub).to.have.been.calledWithExactly(
      'docker',
      DockerClientTestBuilder.listImagesArguments('solo-cluster-control-plane'),
      {commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE},
    );
  });

  it('caches the docker kind container command', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    const nodeName: string = 'solo-cluster-control-plane';
    shellRunnerRunStub
      .withArgs('docker', DockerClientTestBuilder.containerExistsArguments(nodeName), sinon.match.object)
      .resolves([]);
    shellRunnerRunStub
      .withArgs('docker', DockerClientTestBuilder.listImagesArguments(nodeName))
      .resolves(['docker.io/library/busybox:latest']);

    const client: DockerClient = DockerClientTestBuilder.build();
    await client.listLoadedImagesInCluster('solo-cluster');
    await client.listLoadedImagesInCluster('solo-cluster');

    expect(shellRunnerRunStub.withArgs('docker', DockerClientTestBuilder.containerExistsArguments(nodeName))).to.have
      .been.calledOnce;
    expect(shellRunnerRunStub).to.not.have.been.calledWith('podman', sinon.match.any, sinon.match.any);
  });

  it('loads image archives into a docker-backed kind cluster with kind', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    const kindExecutable: string = '/home/runner/.solo/bin/kind';
    const dependencyManager: DependencyManager = DockerClientTestBuilder.buildDependencyManager(kindExecutable);
    const kindLoadImageArchiveStub: SinonStub = sandbox.stub().resolves();
    const kindBuilder: DockerClientTestKindBuilder = new DockerClientTestKindBuilder({
      loadImageArchive: kindLoadImageArchiveStub,
    } as unknown as KindClient);
    shellRunnerRunStub
      .withArgs('docker', DockerClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .resolves([]);

    const client: DockerClient = DockerClientTestBuilder.build(dependencyManager, kindBuilder);
    await client.loadImageArchiveIntoCluster('/tmp/busybox.tar', 'kind');

    expect(kindBuilder.executablePath).to.equal(kindExecutable);
    expect(kindBuilder.skipVersionCheck).to.equal(true);
    expect(kindLoadImageArchiveStub).to.have.been.calledWith(
      '/tmp/busybox.tar',
      sinon.match.has('archivePath', '/tmp/busybox.tar').and(sinon.match.has('name', 'kind')),
    );
  });
});

class DockerClientTestBuilder {
  public static build(
    dependencyManager: DependencyManager = {} as DependencyManager,
    kindBuilder: DefaultKindClientBuilder = {} as DefaultKindClientBuilder,
  ): DockerClient {
    return new DockerClient(kindBuilder, {} as SoloLogger, dependencyManager);
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
}

class DockerClientTestKindBuilder extends DefaultKindClientBuilder {
  public executablePath: string | undefined;
  public skipVersionCheck: boolean | undefined;

  public constructor(private readonly kindClient: KindClient) {
    super();
  }

  public override executable(executable: string): DefaultKindClientBuilder {
    this.executablePath = executable;
    return this;
  }

  public override async build(skipVersionCheck?: boolean): Promise<KindClient> {
    this.skipVersionCheck = skipVersionCheck;
    return this.kindClient;
  }
}
