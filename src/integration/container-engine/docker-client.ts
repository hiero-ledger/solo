// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import {inject, injectable} from 'tsyringe-neo';
import {ContainerEngineClient} from './container-engine-client.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {LoadDockerImageOptionsBuilder} from '../kind/model/load-docker-image/load-docker-image-options-builder.js';
import {KindClient} from '../kind/kind-client.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {DefaultKindClientBuilder} from '../kind/impl/default-kind-client-builder.js';
import {DependencyManager} from '../../core/dependency-managers/index.js';
import * as constants from '../../core/constants.js';
import {LoadImageArchiveOptionsBuilder} from '../kind/model/load-image-archive/load-image-archive-options-builder.js';
import {LoadImageArchiveOptions} from '../kind/model/load-image-archive/load-image-archive-options.js';
import {LoadDockerImageOptions} from '../kind/model/load-docker-image/load-docker-image-options.js';

@injectable()
export class DockerClient implements ContainerEngineClient {
  public constructor(
    @inject(InjectTokens.KindBuilder) private readonly kindBuilder?: DefaultKindClientBuilder,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DependencyManager) private readonly dependencyManager?: DependencyManager,
  ) {
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.dependencyManager = patchInject(dependencyManager, InjectTokens.DependencyManager, this.constructor.name);
  }

  public async pullImage(image: string): Promise<void> {
    const platformArguments: string = ` --platform ${this.quote(this.defaultLinuxPlatform())}`;
    try {
      await this.shellRunner().run(`docker pull${platformArguments} ${this.quote(image)}`);
    } catch {
      await this.shellRunner().run(`docker pull${platformArguments} ${this.quote(image)}`);
    }
  }

  public async saveImage(image: string, archivePath: string): Promise<void> {
    await fs.mkdir(path.dirname(archivePath), {recursive: true});
    const platformArguments: string = ` --platform ${this.quote(this.defaultLinuxPlatform())}`;
    await this.shellRunner().run(
      `docker image save${platformArguments} ${this.quote(image)} --output ${this.quote(archivePath)}`,
    );
  }

  public async loadImage(archivePath: string): Promise<void> {
    await this.shellRunner().run(`docker load --input ${this.quote(archivePath)}`);
  }

  public async loadImageArchiveIntoCluster(
    archivePath: string,
    clusterReference?: string,
    nodes?: string,
  ): Promise<void> {
    const options: LoadImageArchiveOptions = LoadImageArchiveOptionsBuilder.builder()
      .archivePath(archivePath)
      .name(clusterReference)
      .nodes(nodes)
      .build();

    // Either disable throw on empty STFOUT and STDERR or parse output if present

    const kindExecutable: string = await this.dependencyManager.getExecutable(constants.KIND);
    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build(true);

    await kindClient.loadImageArchive(archivePath, options);
  }

  public async removeImage(image: string): Promise<void> {
    await this.shellRunner().run(`docker image rm ${this.quote(image)}`);
  }

  private shellRunner(): ShellRunner {
    return new ShellRunner(this.logger);
  }

  private quote(value: string): string {
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
  }

  private defaultLinuxPlatform(): string {
    switch (process.arch) {
      case 'arm64': {
        return 'linux/arm64';
      }
      case 'x64': {
        return 'linux/amd64';
      }
      default: {
        throw new Error(`Unsupported host architecture for kind image export: ${process.arch}`);
      }
    }
  }
}
