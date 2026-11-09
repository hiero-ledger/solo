// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonFakeTimers, type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {ClusterStateService} from '../../../../src/integration/container-engine/cluster-state-service.js';
import {type ContainerEngineState} from '../../../../src/integration/container-engine/container-engine-state.js';
import {type KindClusterContainer} from '../../../../src/integration/container-engine/kind-cluster-container.js';
import {type ContainerEngineClient} from '../../../../src/integration/container-engine/container-engine-client.js';
import {type ContainerEngineCommand} from '../../../../src/integration/container-engine/container-engine-command.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {SubprocessCommandProfile} from '../../../../src/core/subprocess-command-profile.js';

const DOCKER_COMMAND: ContainerEngineCommand = {executable: 'docker', argumentsPrefix: []};
const SUDO_PODMAN_COMMAND: ContainerEngineCommand = {executable: 'sudo', argumentsPrefix: ['-n', 'env', 'podman']};
const KIND_PS_ARGUMENTS: string[] = [
  'ps',
  '-a',
  '--filter',
  'label=io.x-k8s.kind.cluster',
  '--format',
  '{{.Names}}\t{{.State}}',
];
const labelArguments: (containerName: string) => string[] = (containerName: string): string[] => [
  'inspect',
  '--format',
  '{{index .Config.Labels "io.x-k8s.kind.cluster"}}',
  containerName,
];

let clusterNodeCommands: Record<string, ContainerEngineCommand>;

const buildService: () => ClusterStateService = (): ClusterStateService =>
  new ClusterStateService(
    {} as SoloLogger,
    {
      getClusterNodeCommand: async (clusterName: string): Promise<ContainerEngineCommand | undefined> =>
        clusterNodeCommands[clusterName],
    } as ContainerEngineClient,
  );

describe('ClusterStateService', (): void => {
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
    clusterNodeCommands = {};
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('reports docker running when docker info succeeds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'docker', running: true});
  });

  it('falls back to podman when docker is absent but podman info succeeds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).rejects(new Error('docker not found'));
    shellRunnerRunStub.withArgs('podman', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'podman', running: true});
  });

  it('reports docker installed but stopped when only the docker CLI responds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).rejects(new Error('daemon not running'));
    shellRunnerRunStub.withArgs('podman', ['info'], sinon.match.object).rejects(new Error('podman not found'));
    shellRunnerRunStub.withArgs('docker', ['--version'], sinon.match.object).resolves(['Docker version 27.0.0']);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'docker', running: false});
  });

  it('reports no engine when neither docker nor podman is installed', async (): Promise<void> => {
    shellRunnerRunStub.rejects(new Error('command not found'));

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: undefined, running: false});
  });

  it('runs engine probes with the container engine environment profile', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);

    await buildService().getEngineState();

    expect(shellRunnerRunStub.firstCall.args[2].commandProfile).to.equal(SubprocessCommandProfile.CONTAINER_ENGINE);
  });

  it('lists kind cluster containers with their cluster label and running state', async (): Promise<void> => {
    shellRunnerRunStub
      .withArgs('docker', KIND_PS_ARGUMENTS, sinon.match.object)
      .resolves(['solo-cluster-control-plane\trunning', 'other-cluster-control-plane\texited']);
    shellRunnerRunStub
      .withArgs('docker', labelArguments('solo-cluster-control-plane'), sinon.match.object)
      .resolves(['solo-cluster']);
    shellRunnerRunStub
      .withArgs('docker', labelArguments('other-cluster-control-plane'), sinon.match.object)
      .resolves(['other-cluster']);

    const containers: KindClusterContainer[] = await buildService().listKindClusterContainers('docker');

    expect(containers).to.deep.equal([
      {
        containerName: 'solo-cluster-control-plane',
        clusterName: 'solo-cluster',
        running: true,
        engineCommand: DOCKER_COMMAND,
      },
      {
        containerName: 'other-cluster-control-plane',
        clusterName: 'other-cluster',
        running: false,
        engineCommand: DOCKER_COMMAND,
      },
    ]);
  });

  it('also lists a cluster only the resolved rootful podman command can see', async (): Promise<void> => {
    clusterNodeCommands = {'solo-cluster': SUDO_PODMAN_COMMAND};
    shellRunnerRunStub.withArgs('podman', KIND_PS_ARGUMENTS, sinon.match.object).resolves([]);
    shellRunnerRunStub
      .withArgs('sudo', ['-n', 'env', 'podman', ...KIND_PS_ARGUMENTS], sinon.match.object)
      .resolves(['solo-cluster-control-plane\texited']);
    shellRunnerRunStub
      .withArgs('sudo', ['-n', 'env', 'podman', ...labelArguments('solo-cluster-control-plane')], sinon.match.object)
      .resolves(['solo-cluster']);

    const service: ClusterStateService = buildService();
    const containers: KindClusterContainer[] = await service.listKindClusterContainers('podman', ['solo-cluster']);

    expect(containers).to.deep.equal([
      {
        containerName: 'solo-cluster-control-plane',
        clusterName: 'solo-cluster',
        running: false,
        engineCommand: SUDO_PODMAN_COMMAND,
      },
    ]);

    await service.startContainers(containers);
    expect(
      shellRunnerRunStub.calledWith(
        'sudo',
        ['-n', 'env', 'podman', 'start', 'solo-cluster-control-plane'],
        sinon.match.object,
      ),
    ).to.be.true;
  });

  it('starts and stops the given containers through the engine CLI', async (): Promise<void> => {
    shellRunnerRunStub.resolves([]);
    const container: KindClusterContainer = {
      containerName: 'solo-cluster-control-plane',
      clusterName: 'solo-cluster',
      running: true,
      engineCommand: DOCKER_COMMAND,
    };

    const service: ClusterStateService = buildService();
    await service.startContainers([container]);
    await service.stopContainers([container]);

    expect(shellRunnerRunStub.calledWith('docker', ['start', 'solo-cluster-control-plane'], sinon.match.object)).to.be
      .true;
    expect(shellRunnerRunStub.calledWith('docker', ['stop', 'solo-cluster-control-plane'], sinon.match.object)).to.be
      .true;
  });

  it('does not launch the engine when it is already running', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().startEngine();

    expect(state).to.deep.equal({engineName: 'docker', running: true});
    expect(shellRunnerRunStub.calledWith('open', sinon.match.array, sinon.match.object)).to.be.false;
    expect(shellRunnerRunStub.calledWith('podman', ['machine', 'start'], sinon.match.object)).to.be.false;
  });

  describe('engine launch', (): void => {
    let isDarwinStub: SinonStub;
    let isWin32Stub: SinonStub;
    let isLinuxStub: SinonStub;

    const engineStopped: (engineName: string) => void = (engineName: string): void => {
      shellRunnerRunStub.withArgs(sinon.match.string, ['info'], sinon.match.object).rejects(new Error('not running'));
      shellRunnerRunStub.withArgs(engineName, ['--version'], sinon.match.object).resolves(['1.0.0']);
      shellRunnerRunStub
        .withArgs(engineName === 'docker' ? 'podman' : 'docker', ['--version'], sinon.match.object)
        .rejects(new Error('not installed'));
    };

    beforeEach((): void => {
      isDarwinStub = sandbox.stub(OperatingSystem, 'isDarwin').returns(false);
      isWin32Stub = sandbox.stub(OperatingSystem, 'isWin32').returns(false);
      isLinuxStub = sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    });

    it('opens Docker Desktop on macOS and waits for the engine', async (): Promise<void> => {
      isDarwinStub.returns(true);
      engineStopped('docker');
      shellRunnerRunStub
        .withArgs('open', ['-ga', 'Docker'], sinon.match.object)
        .callsFake(async (): Promise<string[]> => {
          shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);
          return [];
        });

      const state: ContainerEngineState = await buildService().startEngine();

      expect(state).to.deep.equal({engineName: 'docker', running: true});
    });

    it('starts Docker Desktop through powershell on Windows', async (): Promise<void> => {
      isWin32Stub.returns(true);
      engineStopped('docker');
      shellRunnerRunStub
        .withArgs('powershell', sinon.match.array, sinon.match.object)
        .callsFake(async (): Promise<string[]> => {
          shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);
          return [];
        });

      const state: ContainerEngineState = await buildService().startEngine();

      expect(state).to.deep.equal({engineName: 'docker', running: true});
      const powershellArguments: string[] = shellRunnerRunStub
        .getCalls()
        .find((call): boolean => call.args[0] === 'powershell').args[1];
      expect(powershellArguments.at(-1)).to.contain('Docker Desktop.exe');
    });

    it('starts the podman machine when podman is stopped', async (): Promise<void> => {
      isDarwinStub.returns(true);
      engineStopped('podman');
      shellRunnerRunStub
        .withArgs('podman', ['machine', 'start'], sinon.match.object)
        .callsFake(async (): Promise<string[]> => {
          shellRunnerRunStub.withArgs('podman', ['info'], sinon.match.object).resolves([]);
          return [];
        });

      const state: ContainerEngineState = await buildService().startEngine();

      expect(state).to.deep.equal({engineName: 'podman', running: true});
    });

    it('refuses to auto-start the Docker daemon on Linux', async (): Promise<void> => {
      isLinuxStub.returns(true);
      engineStopped('docker');

      await expect(buildService().startEngine()).to.be.rejectedWith(
        SoloErrors.system.containerEngineStartFailed,
        'systemctl start docker',
      );
    });

    it('refuses to auto-start podman on Linux', async (): Promise<void> => {
      isLinuxStub.returns(true);
      engineStopped('podman');

      await expect(buildService().startEngine()).to.be.rejectedWith(SoloErrors.system.containerEngineStartFailed);
      expect(shellRunnerRunStub.calledWith('podman', ['machine', 'start'], sinon.match.object)).to.be.false;
    });

    it('reports a failed launch command as a container engine start failure', async (): Promise<void> => {
      isDarwinStub.returns(true);
      engineStopped('docker');
      shellRunnerRunStub
        .withArgs('open', ['-ga', 'Docker'], sinon.match.object)
        .rejects(new Error("Unable to find application named 'Docker'"));

      await expect(buildService().startEngine()).to.be.rejectedWith(
        SoloErrors.system.containerEngineStartFailed,
        'Unable to find application',
      );
    });

    it('fails when the engine does not become ready in time', async (): Promise<void> => {
      isDarwinStub.returns(true);
      engineStopped('docker');
      shellRunnerRunStub.withArgs('open', ['-ga', 'Docker'], sinon.match.object).resolves([]);
      const clock: SinonFakeTimers = sandbox.useFakeTimers({toFake: ['setTimeout', 'Date']});

      const result: Promise<ContainerEngineState> = buildService().startEngine();
      const assertion: Chai.PromisedAssertion = expect(result).to.be.rejectedWith(
        SoloErrors.system.containerEngineStartFailed,
        'did not become ready',
      );
      await clock.tickAsync(4 * 60 * 1000);
      await assertion;
    });
  });
});
