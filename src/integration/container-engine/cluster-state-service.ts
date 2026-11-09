// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import * as constants from '../../core/constants.js';
import {type ContainerEngineState} from './container-engine-state.js';
import {type KindClusterContainer} from './kind-cluster-container.js';
import {type ContainerEngineClient} from './container-engine-client.js';
import {type ContainerEngineCommand} from './container-engine-command.js';
import {KindProviderResolver} from './kind-provider-resolver.js';

/**
 * Detects and controls the state of the local container engine (Docker Desktop / Podman machine)
 * and the Kind cluster node containers it hosts. Backs the `solo cluster-ref state` subcommands.
 *
 * Solo prefers Docker and only falls back to Podman when Docker is absent (matching
 * ContainerEngineResourceInspector), so detection probes Docker first and Podman second, unless
 * KIND_EXPERIMENTAL_PROVIDER selects Podman. Cluster node containers are reached through the engine
 * command the ContainerEngineClient resolves, so rootful Podman (`sudo podman`) works too.
 */
@injectable()
export class ClusterStateService {
  /** Label Kind stamps on every cluster node container; used to discover Solo Kind cluster containers. */
  private static readonly KIND_CLUSTER_LABEL: string = 'io.x-k8s.kind.cluster';
  private static readonly PROBE_TIMEOUT_MS: number = 15 * 1000;
  private static readonly CONTAINER_OPERATION_TIMEOUT_MS: number = 2 * 60 * 1000;
  private static readonly ENGINE_START_TIMEOUT_MS: number = 3 * 60 * 1000;
  private static readonly ENGINE_START_POLL_INTERVAL_MS: number = 3 * 1000;

  private readonly shellRunner: ShellRunner;

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ContainerEngineClient) private readonly containerEngine?: ContainerEngineClient,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.containerEngine = patchInject(containerEngine, InjectTokens.ContainerEngineClient, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  /**
   * Probes the local container engine: which engine CLI is present and whether its daemon/VM responds.
   */
  public async getEngineState(): Promise<ContainerEngineState> {
    const engineNames: string[] =
      KindProviderResolver.current() === constants.PODMAN
        ? [constants.PODMAN, constants.DOCKER]
        : [constants.DOCKER, constants.PODMAN];
    for (const engineName of engineNames) {
      if (await this.commandSucceeds(engineName, ['info'])) {
        return {engineName, running: true};
      }
    }
    for (const engineName of engineNames) {
      if (await this.commandSucceeds(engineName, ['--version'])) {
        return {engineName, running: false};
      }
    }
    return {engineName: undefined, running: false};
  }

  /**
   * Ensures the container engine is running, launching Docker Desktop or the Podman machine when
   * needed. Returns immediately when the engine already responds. Throws when no engine is
   * installed, when the platform offers no way to auto-start the engine (Linux), or when the
   * engine does not become ready in time.
   */
  public async startEngine(): Promise<ContainerEngineState> {
    const state: ContainerEngineState = await this.getEngineState();
    if (state.running) {
      return state;
    }
    if (!state.engineName) {
      throw new SoloErrors.system.containerEngineNotFound();
    }

    try {
      await this.launchEngine(state.engineName);
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloErrors.system.containerEngineStartFailed(state.engineName, (error as Error).message);
    }
    return await this.waitForEngine(state.engineName);
  }

  /**
   * Lists the Kind cluster node containers, running or stopped, seen by the engine and by the engine
   * command that owns each of the given clusters (for example `sudo podman`, whose containers plain
   * `podman` does not list).
   */
  public async listKindClusterContainers(
    engineName: string,
    clusterNames: readonly string[] = [],
  ): Promise<KindClusterContainer[]> {
    const engineCommands: Map<string, ContainerEngineCommand> = new Map<string, ContainerEngineCommand>();
    for (const engineCommand of [
      {executable: engineName, argumentsPrefix: []},
      ...(await Promise.all(
        clusterNames.map((clusterName): Promise<ContainerEngineCommand | undefined> =>
          this.containerEngine.getClusterNodeCommand(clusterName),
        ),
      )),
    ]) {
      if (engineCommand) {
        engineCommands.set([engineCommand.executable, ...engineCommand.argumentsPrefix].join(' '), engineCommand);
      }
    }

    const containers: Map<string, KindClusterContainer> = new Map<string, KindClusterContainer>();
    for (const engineCommand of engineCommands.values()) {
      const lines: string[] = await this.runEngine(
        engineCommand,
        [
          'ps',
          '-a',
          '--filter',
          `label=${ClusterStateService.KIND_CLUSTER_LABEL}`,
          '--format',
          '{{.Names}}\t{{.State}}',
        ],
        ClusterStateService.PROBE_TIMEOUT_MS,
      );
      for (const line of lines) {
        const [containerName, state]: string[] = line.trim().split('\t');
        if (!containerName || containers.has(containerName)) {
          continue;
        }
        containers.set(containerName, {
          containerName,
          clusterName: await this.readClusterLabel(engineCommand, containerName),
          running: state?.trim().toLowerCase() === 'running',
          engineCommand,
        });
      }
    }
    return [...containers.values()];
  }

  /**
   * Starts the given stopped containers, each through the engine command that sees it.
   */
  public async startContainers(containers: readonly KindClusterContainer[]): Promise<void> {
    for (const container of containers) {
      await this.runEngine(
        container.engineCommand,
        ['start', container.containerName],
        ClusterStateService.CONTAINER_OPERATION_TIMEOUT_MS,
      );
    }
  }

  /**
   * Stops the given running containers, each through the engine command that sees it.
   */
  public async stopContainers(containers: readonly KindClusterContainer[]): Promise<void> {
    for (const container of containers) {
      await this.runEngine(
        container.engineCommand,
        ['stop', container.containerName],
        ClusterStateService.CONTAINER_OPERATION_TIMEOUT_MS,
      );
    }
  }

  private async launchEngine(engineName: string): Promise<void> {
    if (engineName === constants.PODMAN) {
      if (OperatingSystem.isLinux()) {
        // on Linux Podman runs daemonless; if `podman info` fails something deeper is wrong
        throw new SoloErrors.system.containerEngineStartFailed(
          engineName,
          'Podman is installed but not responding and cannot be auto-started on Linux; ' +
            'check the installation (podman info) and retry',
        );
      }
      await this.shellRunner.run(constants.PODMAN, ['machine', 'start'], {
        commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
        timeoutMs: ClusterStateService.ENGINE_START_TIMEOUT_MS,
      });
      return;
    }

    if (OperatingSystem.isDarwin()) {
      await this.shellRunner.run('open', ['-ga', 'Docker'], {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS});
    } else if (OperatingSystem.isWin32()) {
      await this.shellRunner.run(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          String.raw`Start-Process -FilePath "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"`,
        ],
        {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS},
      );
    } else {
      throw new SoloErrors.system.containerEngineStartFailed(
        engineName,
        'the Docker daemon cannot be auto-started on Linux; start it manually (for example: sudo systemctl start docker)',
      );
    }
  }

  private async waitForEngine(engineName: string): Promise<ContainerEngineState> {
    const deadline: number = Date.now() + ClusterStateService.ENGINE_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.commandSucceeds(engineName, ['info'])) {
        return {engineName, running: true};
      }
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, ClusterStateService.ENGINE_START_POLL_INTERVAL_MS);
      });
    }
    throw new SoloErrors.system.containerEngineStartFailed(
      engineName,
      `the engine did not become ready within ${ClusterStateService.ENGINE_START_TIMEOUT_MS / 1000}s`,
    );
  }

  private async readClusterLabel(engineCommand: ContainerEngineCommand, containerName: string): Promise<string> {
    try {
      const output: string[] = await this.runEngine(
        engineCommand,
        ['inspect', '--format', `{{index .Config.Labels "${ClusterStateService.KIND_CLUSTER_LABEL}"}}`, containerName],
        ClusterStateService.PROBE_TIMEOUT_MS,
      );
      return output.join('').trim() || containerName;
    } catch {
      // best-effort: fall back to the container name when the label cannot be read
      return containerName;
    }
  }

  private async commandSucceeds(executable: string, commandArguments: string[]): Promise<boolean> {
    try {
      await this.runEngine({executable, argumentsPrefix: []}, commandArguments, ClusterStateService.PROBE_TIMEOUT_MS);
      return true;
    } catch {
      // probe only: a failure means 'not available', never an error to surface
      return false;
    }
  }

  private async runEngine(
    engineCommand: ContainerEngineCommand,
    commandArguments: string[],
    timeoutMs: number,
  ): Promise<string[]> {
    return this.shellRunner.run(engineCommand.executable, [...engineCommand.argumentsPrefix, ...commandArguments], {
      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
      timeoutMs,
    });
  }
}
