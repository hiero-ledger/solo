// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type ContainerEngineCommand} from './container-engine-command.js';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';

@injectable()
export class PodmanClient {
  private static readonly CONTAINER_ENGINE_PROBE_TIMEOUT_MS: number = 5 * 1000;
  private readonly shellRunner: ShellRunner;

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  public async getKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const detectedCommand: ContainerEngineCommand | undefined = await this.detectKindContainerCommand(nodeName);

    if (detectedCommand) {
      return detectedCommand;
    }

    if (constants.getEnvironmentVariable('KIND_EXPERIMENTAL_PROVIDER') === constants.PODMAN) {
      return PodmanClient.podmanCommand();
    }

    return undefined;
  }

  public async loadImageArchiveIntoCluster(
    kindExecutable: string,
    archivePath: string,
    clusterName: string,
    engineCommand: ContainerEngineCommand,
  ): Promise<void> {
    const kindArguments: string[] = ['load', 'image-archive', archivePath, '--name', clusterName];
    const pathEnvironment: string = `${PathEx.dirname(kindExecutable)}${PathEx.delimiter}${process.env.PATH || ''}`;

    if (PodmanClient.isSudoPodmanCommand(engineCommand)) {
      await this.shellRunner.run('sudo', [
        '-n',
        'env',
        `KIND_EXPERIMENTAL_PROVIDER=${constants.PODMAN}`,
        `PATH=${pathEnvironment}`,
        kindExecutable,
        ...kindArguments,
      ]);
      return;
    }

    await this.shellRunner.run(kindExecutable, kindArguments, {
      environmentVariablesToAppend: {
        KIND_EXPERIMENTAL_PROVIDER: constants.PODMAN,
        PATH: pathEnvironment,
      },
    });
  }

  private static podmanCommand(): ContainerEngineCommand {
    return {
      executable: constants.PODMAN,
      argumentsPrefix: [],
    };
  }

  private static sudoPodmanCommand(): ContainerEngineCommand {
    return {
      executable: 'sudo',
      argumentsPrefix: ['-n', constants.PODMAN],
    };
  }

  private static isSudoPodmanCommand(command: ContainerEngineCommand): boolean {
    return command.executable === 'sudo' && command.argumentsPrefix.includes(constants.PODMAN);
  }

  private async detectKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const podmanCommand: ContainerEngineCommand = PodmanClient.podmanCommand();

    if (await this.containerExists(podmanCommand, nodeName)) {
      return podmanCommand;
    }

    const sudoPodmanCommand: ContainerEngineCommand = PodmanClient.sudoPodmanCommand();

    if (await this.containerExists(sudoPodmanCommand, nodeName)) {
      return sudoPodmanCommand;
    }

    return undefined;
  }

  private async containerExists(command: ContainerEngineCommand, nodeName: string): Promise<boolean> {
    try {
      await this.shellRunner.run(command.executable, [...command.argumentsPrefix, 'container', 'exists', nodeName], {
        timeoutMs: PodmanClient.CONTAINER_ENGINE_PROBE_TIMEOUT_MS,
      });
      return true;
    } catch {
      // best-effort probe: fall back to the next supported container engine when this one cannot see the kind node
      return false;
    }
  }
}
