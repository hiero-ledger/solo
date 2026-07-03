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
import {LoadDockerImageOptionsBuilder} from '../kind/model/load-docker-image/load-docker-image-options-builder.js';
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

  public async loadImage(archivePath: string): Promise<readonly string[]> {
    const output: string[] = await this.shellRunner.run('docker', ['load', '--input', archivePath]);
    return DockerClient.parseLoadedImageReferences(output);
  }

  public async loadImagesIntoCluster(images: readonly string[], clusterReference?: string): Promise<void> {
    if (images.length === 0) {
      return;
    }

    const kindExecutable: string = await this.dependencyManager.getExecutable(constants.KIND);
    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build(true);

    await kindClient.loadDockerImages(images, LoadDockerImageOptionsBuilder.builder().name(clusterReference).build());
  }

  /**
   * Extracts the image references reported by `docker load` (lines of the form `Loaded image: <ref>`).
   */
  private static parseLoadedImageReferences(output: readonly string[]): readonly string[] {
    const loadedImagePrefix: string = 'Loaded image: ';

    return output
      .map((line: string): string => line.trim())
      .filter((line: string): boolean => line.startsWith(loadedImagePrefix))
      .map((line: string): string => line.slice(loadedImagePrefix.length).trim())
      .filter((reference: string): boolean => reference.length > 0);
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
}
