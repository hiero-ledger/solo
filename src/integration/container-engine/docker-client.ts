// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import {inject, injectable} from 'tsyringe-neo';
import {ContainerEngineClient} from './container-engine-client.js';
import {type ContainerEngineResources} from './container-engine-resources.js';
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

@injectable()
export class DockerClient implements ContainerEngineClient {
  private static readonly IMAGE_PULL_TIMEOUT_MS: number = 10 * 60 * 1000;
  private static readonly IMAGE_PULL_IDLE_TIMEOUT_MS: number = 10 * 60 * 1000;
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

    await this.shellRunner.run(
      'docker',
      ['pull', '--platform', platform, image],
      true,
      false,
      {},
      DockerClient.IMAGE_PULL_TIMEOUT_MS,
      true,
      DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
    );
  }

  public async saveImage(image: string, archivePath: string): Promise<void> {
    await fs.mkdir(path.dirname(archivePath), {recursive: true});

    const platform: string = Architecture.getLinuxPlatform();
    const craneExecutable: string = await this.dependencyManager.getExecutable(constants.CRANE);

    await this.shellRunner.run(
      craneExecutable,
      ['pull', '--platform', platform, image, archivePath],
      true,
      false,
      {},
      DockerClient.IMAGE_PULL_TIMEOUT_MS,
      true,
      DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
    );
  }

  public async loadImage(archivePath: string): Promise<void> {
    await this.shellRunner.run('docker', ['load', '--input', archivePath]);
  }

  public async loadImageArchiveIntoCluster(archivePath: string, clusterReference?: string): Promise<void> {
    const options: LoadImageArchiveOptions = LoadImageArchiveOptionsBuilder.builder()
      .archivePath(archivePath)
      .name(clusterReference)
      .build();

    const kindExecutable: string = await this.dependencyManager.getExecutable(constants.KIND);
    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build(true);

    await kindClient.loadImageArchive(archivePath, options);
  }

  public async removeImage(image: string): Promise<void> {
    await this.shellRunner.run('docker', ['image', 'rm', image]);
  }

  public async listLoadedImagesInCluster(clusterName: string): Promise<readonly string[]> {
    const nodeName: string = `${clusterName}-control-plane`;

    const output: string[] = await this.shellRunner.run('docker', [
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

  public async getAvailableResources(): Promise<ContainerEngineResources | undefined> {
    try {
      // useShell=false so the '{{json .}}' format argument is not split on its space by the shell.
      const output: string[] = await this.shellRunner.run(
        'docker',
        ['info', '--format', '{{json .}}'],
        false,
        false,
        {},
        undefined,
        false,
      );
      const info: {MemTotal?: number; NCPU?: number} = JSON.parse(output.join('').trim());
      if (typeof info.MemTotal !== 'number' || typeof info.NCPU !== 'number') {
        return undefined;
      }
      return {memoryBytes: info.MemTotal, cpuCount: info.NCPU};
    } catch (error) {
      this.logger.debug('Unable to read docker engine resources', error);
      return undefined;
    }
  }
}
