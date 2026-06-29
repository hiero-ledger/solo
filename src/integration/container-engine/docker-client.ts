// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import {inject, injectable} from 'tsyringe-neo';
import {ContainerEngineClient} from './container-engine-client.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {KindClient} from '../kind/kind-client.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {DefaultKindClientBuilder} from '../kind/impl/default-kind-client-builder.js';
import {DependencyManager} from '../../core/dependency-managers/index.js';
import * as constants from '../../core/constants.js';
import {LoadImageArchiveOptionsBuilder} from '../kind/model/load-image-archive/load-image-archive-options-builder.js';
import {LoadImageArchiveOptions} from '../kind/model/load-image-archive/load-image-archive-options.js';
import {Architecture} from '../../business/utils/architecture.js';
import {type ContainerEngineCommand} from './container-engine-command.js';

@injectable()
export class DockerClient implements ContainerEngineClient {
  private static readonly IMAGE_PULL_TIMEOUT_MS: number = 10 * 60 * 1000;
  private static readonly IMAGE_PULL_IDLE_TIMEOUT_MS: number = 10 * 60 * 1000;
  private static readonly CONTAINER_ENGINE_PROBE_TIMEOUT_MS: number = 5 * 1000;
  private readonly shellRunner: ShellRunner;

  public constructor(
    @inject(InjectTokens.KindBuilder) private readonly kindBuilder?: DefaultKindClientBuilder,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DependencyManager) private readonly dependencyManager?: DependencyManager,
  ) {
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.dependencyManager = patchInject(dependencyManager, InjectTokens.DependencyManager, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  public async pullImage(image: string): Promise<void> {
    const platform: string = Architecture.getLinuxPlatform();

    await this.shellRunner.run('docker', ['pull', '--platform', platform, image], {
      verbose: true,
      timeoutMs: DockerClient.IMAGE_PULL_TIMEOUT_MS,
      idleTimeoutMs: DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
    });
  }

  public async saveImage(image: string, archivePath: string): Promise<void> {
    await fs.mkdir(path.dirname(archivePath), {recursive: true});

    const platform: string = Architecture.getLinuxPlatform();
    const craneExecutable: string = await this.dependencyManager.getExecutable(constants.CRANE);

    await this.shellRunner.run(craneExecutable, ['pull', '--platform', platform, image, archivePath], {
      verbose: true,
      timeoutMs: DockerClient.IMAGE_PULL_TIMEOUT_MS,
      idleTimeoutMs: DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
    });
  }

  public async loadImage(archivePath: string): Promise<void> {
    await this.shellRunner.run('docker', ['load', '--input', archivePath]);
  }

  public async loadImageArchiveIntoCluster(archivePath: string, clusterName: string = 'kind'): Promise<void> {
    const nodeName: string = `${clusterName}-control-plane`;
    const engineCommand: ContainerEngineCommand = await this.getKindContainerEngineCommand(nodeName);
    const kindExecutable: string = await this.dependencyManager.getExecutable(constants.KIND);

    if (DockerClient.isPodmanCommand(engineCommand)) {
      await this.loadImageArchiveIntoPodmanBackedCluster(kindExecutable, archivePath, clusterName, engineCommand);
      return;
    }

    const options: LoadImageArchiveOptions = LoadImageArchiveOptionsBuilder.builder()
      .archivePath(archivePath)
      .name(clusterName)
      .build();

    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build(true);

    await kindClient.loadImageArchive(archivePath, options);
  }

  public async removeImage(image: string): Promise<void> {
    await this.shellRunner.run('docker', ['image', 'rm', image]);
  }

  public async listLoadedImagesInCluster(clusterName: string): Promise<readonly string[]> {
    const nodeName: string = `${clusterName}-control-plane`;
    const engineCommand: ContainerEngineCommand = await this.getKindContainerEngineCommand(nodeName);

    const output: string[] = await this.shellRunner.run(engineCommand.executable, [
      ...engineCommand.argumentsPrefix,
      'exec',
      '--privileged',
      nodeName,
      'ctr',
      '--namespace=k8s.io',
      'images',
      'ls',
      '-q',
    ]);

    return output
      .map((line): string => line.trim())
      .filter((line): boolean => line.length > 0)
      .filter((line): boolean => !line.startsWith('import-'));
  }

  private async getKindContainerEngineCommand(nodeName: string): Promise<ContainerEngineCommand> {
    const podmanCommand: ContainerEngineCommand | undefined = await this.getPodmanKindContainerCommand(nodeName);

    if (podmanCommand) {
      return podmanCommand;
    }

    if (process.env.KIND_EXPERIMENTAL_PROVIDER === constants.PODMAN) {
      return {
        executable: constants.PODMAN,
        argumentsPrefix: [],
      };
    }

    return {
      executable: constants.DOCKER,
      argumentsPrefix: [],
    };
  }

  private async loadImageArchiveIntoPodmanBackedCluster(
    kindExecutable: string,
    archivePath: string,
    clusterName: string,
    engineCommand: ContainerEngineCommand,
  ): Promise<void> {
    const kindArguments: string[] = ['load', 'image-archive', archivePath, '--name', clusterName];
    const pathEnvironment: string = `${path.dirname(kindExecutable)}${path.delimiter}${process.env.PATH}`;

    if (DockerClient.isSudoPodmanCommand(engineCommand)) {
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

  private static isPodmanCommand(command: ContainerEngineCommand): boolean {
    return command.executable === constants.PODMAN || command.argumentsPrefix.includes(constants.PODMAN);
  }

  private static isSudoPodmanCommand(command: ContainerEngineCommand): boolean {
    return command.executable === 'sudo' && command.argumentsPrefix.includes(constants.PODMAN);
  }

  private async getPodmanKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const podmanCommand: ContainerEngineCommand = {
      executable: constants.PODMAN,
      argumentsPrefix: [],
    };

    if (await this.containerExists(podmanCommand, nodeName)) {
      return podmanCommand;
    }

    const sudoPodmanCommand: ContainerEngineCommand = {
      executable: 'sudo',
      argumentsPrefix: ['-n', constants.PODMAN],
    };

    if (await this.containerExists(sudoPodmanCommand, nodeName)) {
      return sudoPodmanCommand;
    }

    return undefined;
  }

  private async containerExists(command: ContainerEngineCommand, nodeName: string): Promise<boolean> {
    try {
      await this.shellRunner.run(command.executable, [...command.argumentsPrefix, 'container', 'exists', nodeName], {
        timeoutMs: DockerClient.CONTAINER_ENGINE_PROBE_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }
}
