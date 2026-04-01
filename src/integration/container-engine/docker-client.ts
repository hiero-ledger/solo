// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import {inject, injectable} from 'tsyringe-neo';
import {ContainerEngineClient} from './container-engine-client.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {LoadDockerImageOptionsBuilder} from '../kind/model/load-docker-image/load-docker-image-options-builder.js';
import {KindClient} from '../kind/kind-client.js';
import {LoadDockerImageOptions} from '../kind/model/load-docker-image/load-docker-image-options.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type KindClientBuilder} from '../kind/kind-client-builder.js';

@injectable()
export class DockerClient implements ContainerEngineClient {
  public constructor(
    @inject(InjectTokens.KindBuilder) private readonly kindBuilder?: KindClientBuilder,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Pulls an image from its registry using `docker pull`.
   *
   * @param image the image reference to pull
   */
  public async pullImage(image: string): Promise<void> {
    await this.shellRunner().run(`docker pull ${this.quote(image)}`);
  }

  /**
   * Saves an image to a local archive file using `docker save`.
   *
   * @param image the image reference to save
   * @param archivePath the destination archive path
   */
  public async saveImage(image: string, archivePath: string): Promise<void> {
    await fs.mkdir(path.dirname(archivePath), {recursive: true});

    await this.shellRunner().run(`docker save ${this.quote(image)} --output ${this.quote(archivePath)}`);
  }

  /**
   * Loads an image archive into the local Docker engine using `docker load`.
   *
   * @param archivePath the path to the image archive
   */
  public async loadImage(archivePath: string): Promise<void> {
    await this.shellRunner().run(`docker load --input ${this.quote(archivePath)}`);
  }

  /**
   * Loads an image into a Kind cluster.
   *
   * If no cluster name is provided, this method is a no-op because the image is
   * already available in the local Docker engine after pull/load.
   *
   * @param image the image reference to load into the cluster
   * @param clusterReference Kind cluster name
   */
  public async loadImageIntoCluster(image: string, clusterReference: string): Promise<void> {
    const options: LoadDockerImageOptions = LoadDockerImageOptionsBuilder.builder().name(clusterReference).build();

    const kind: KindClient = await this.kindBuilder.build();

    await kind.loadDockerImage(image, options);
  }

  /**
   * Removes an image from the local Docker engine using `docker image rm`.
   *
   * @param image the image reference to remove
   */
  public async removeImage(image: string): Promise<void> {
    await this.shellRunner().run(`docker image rm ${this.quote(image)}`);
  }

  /**
   * Creates a shell runner instance bound to this client's logger.
   *
   * @returns a shell runner
   */
  private shellRunner(): ShellRunner {
    return new ShellRunner(this.logger);
  }

  /**
   * Shell-quotes a value for use in CLI commands.
   *
   * @param value the value to quote
   * @returns the quoted value
   */
  private quote(value: string): string {
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
  }
}
