// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {type Container} from '../../../resources/container/container.js';
import {type TDirectoryData} from '../../../t-directory-data.js';
import {type ContainerReference} from '../../../resources/container/container-reference.js';
import {IllegalArgumentError} from '../../../../../core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../../../core/errors/missing-argument-error.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {type ChildProcessByStdio, spawn} from 'node:child_process';
import {v4 as uuid4} from 'uuid';
import * as tar from 'tar';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type TarCreateFilter} from '../../../../../types/aliases.js';
import {type Context} from '../../../../../types/index.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import type Stream from 'node:stream';
import * as constants from '../../../../../core/constants.js';

export class K8ClientContainer implements Container {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly containerReference: ContainerReference,
    private readonly pods: Pods,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  private async getContext(): Promise<string> {
    return this.kubeConfig.getCurrentContext();
  }

  private async execKubectl(arguments_: string[]): Promise<string> {
    const context: Context = await this.getContext();
    const fullArguments: string[] = ['--context', context, ...arguments_];

    return new Promise((resolve, reject): void => {
      const process: ChildProcessByStdio<null, Stream.Readable, Stream.Readable> = spawn('kubectl', fullArguments, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout: string = '';
      let stderr: string = '';

      process.stdout.on('data', (chunk): void => {
        stdout += chunk.toString();
      });

      process.stderr.on('data', (chunk): void => {
        stderr += chunk.toString();
      });

      process.on('error', (error): void => {
        reject(new SoloError(`container call failed to start: ${error?.message}`));
      });

      process.on('close', (code): void => {
        if (code === 0) {
          resolve(stdout || stderr);
        } else {
          reject(new SoloError(`container call failed: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * Execute `kubectl cp` with retries and optional verification.
   *
   * @param source - kubectl cp source, e.g. `<ns>/<pod>:/path` or `/local/path`
   * @param destination - kubectl cp destination, e.g. `/local/path` or `<ns>/<pod>:/path`
   * @param containerName - name of the container for -c flag
   * @param verifyPath - local filesystem path to verify after copy (usually the destination for copyFrom)
   * @param expectedSize - optional expected file size for strict verification
   */
  private async execKubectlCp(
    source: string,
    destination: string,
    containerName: string,
    verifyPath: string,
    expectedSize?: number,
  ): Promise<void> {
    const maxAttempts: number = constants.CONTAINER_COPY_MAX_ATTEMPTS;
    const arguments_: string[] = ['cp', source, destination, '-c', containerName];

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.execKubectl(arguments_);

        if (!fs.existsSync(verifyPath)) {
          throw new SoloError(`copy failed: missing file at ${verifyPath}`);
        }

        const stat: fs.Stats = fs.statSync(verifyPath);

        if (expectedSize !== undefined && stat.size !== expectedSize) {
          throw new SoloError(
            `copy verification failed: expected size ${expectedSize} but found ${stat.size} at ${verifyPath}`,
          );
        }

        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }

        // backoff between retries
        await sleep(Duration.ofMillis(attempt * constants.CONTAINER_COPY_BACKOFF_MS));
      }
    }
  }

  public async copyFrom(sourcePath: string, destinationDirectory: string): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();

    if (!(await this.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${podName}`);
    }

    if (!fs.existsSync(destinationDirectory)) {
      throw new SoloError(`invalid destination path: ${destinationDirectory}`);
    }

    this.logger.info(
      `copyFrom: [srcPath=${sourcePath}, destDir=${destinationDirectory}] from ${namespace.name}/${podName}:${containerName}`,
    );

    let entries: TDirectoryData[] = await this.listDir(sourcePath);
    if (entries.length !== 1) {
      throw new SoloError(`copyFrom: invalid source path: ${sourcePath}`);
    }
    // handle symbolic link
    if (entries[0].name.includes(' -> ')) {
      const arrowIndex: number = entries[0].name.indexOf(' -> ');
      const targetSuffix: string = entries[0].name.slice(arrowIndex + 4);
      const redirectSourcePath: string = `${path.dirname(sourcePath)}/${targetSuffix}`;
      entries = await this.listDir(redirectSourcePath);
      if (entries.length !== 1) {
        throw new SoloError(`copyFrom: invalid source path: ${redirectSourcePath}`);
      }
    }

    const sourceFileDesc: TDirectoryData = entries[0];
    const sourceFileSize: number = Number.parseInt(sourceFileDesc.size, 10);

    const resolvedRemotePath: string = sourceFileDesc.name;
    const sourceFileName: string = path.basename(resolvedRemotePath);
    const destinationPath: string = path.join(destinationDirectory, sourceFileName);

    this.logger.info(
      `copyFrom: beginning copy [container: ${containerName} ${namespace.name}/${podName}:${resolvedRemotePath} ${destinationPath}]`,
    );

    const remoteSource: string = `${namespace.name}/${podName}:${resolvedRemotePath}`;

    await this.execKubectlCp(remoteSource, destinationPath, containerName, destinationPath, sourceFileSize);

    return true;
  }

  public async copyTo(sourcePath: string, destinationDirectory: string, filter?: TarCreateFilter): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();

    if (!(await this.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${podName}`);
    }

    if (!(await this.hasDir(destinationDirectory))) {
      throw new SoloError(`invalid destination path: ${destinationDirectory}`);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloError(`invalid source path: ${sourcePath}`);
    }

    const remoteDestination: string = `${namespace.name}/${podName}:${destinationDirectory}`;

    this.logger.info(
      `copyTo: [srcPath=${sourcePath}, destDir=${destinationDirectory}] to ${remoteDestination} (container=${containerName})`,
    );

    let localPathToCopy: string = sourcePath;
    let temporaryDirectory: string | undefined;
    let temporaryTar: string | undefined;

    try {
      if (filter) {
        const sourceFileName: string = path.basename(sourcePath);
        const sourceDirectory: string = path.dirname(sourcePath);

        temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-kubectl-cp-src-'));
        temporaryTar = path.join(temporaryDirectory, `${sourceFileName}-${uuid4()}.tar`);

        // Create a filtered tarball
        await tar.c({file: temporaryTar, cwd: sourceDirectory, filter}, [sourceFileName]);
        // Extract the filtered content into the temporaryDirectory.
        await tar.x({file: temporaryTar, cwd: temporaryDirectory});

        localPathToCopy = path.join(temporaryDirectory, sourceFileName);

        if (!fs.existsSync(localPathToCopy)) {
          throw new SoloError(`filtered source path does not exist: ${localPathToCopy}`);
        }
      }

      this.logger.info(`copyTo: beginning copy [container: ${containerName} ${localPathToCopy} ${remoteDestination}]`);

      await this.execKubectlCp(localPathToCopy, remoteDestination, containerName, localPathToCopy);

      return true;
    } finally {
      // Clean up temp artifacts if any.
      if (temporaryTar && fs.existsSync(temporaryTar)) {
        try {
          fs.rmSync(temporaryTar);
        } catch {
          // ignore
        }
      }
      if (temporaryDirectory && fs.existsSync(temporaryDirectory)) {
        try {
          fs.rmSync(temporaryDirectory, {recursive: true, force: true});
        } catch {
          // ignore
        }
      }
    }
  }

  public async execContainer(cmd: string | string[]): Promise<string> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();

    if (!(await this.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${podName}`);
    }

    if (!cmd) {
      throw new MissingArgumentError('command cannot be empty');
    }

    const command: string[] = Array.isArray(cmd) ? cmd : cmd.split(' ');

    this.logger.info(
      `execContainer: beginning call [podName: ${podName} -n ${namespace.name} -c ${containerName} -- ${command.join(' ')}]`,
    );

    const arguments_: string[] = ['exec', podName, '-n', namespace.name, '-c', containerName, '--', ...command];

    return await this.execKubectl(arguments_);
  }

  public async hasDir(destinationPath: string): Promise<boolean> {
    const result: string = await this.execContainer([
      'bash',
      '-c',
      `[[ -d "${destinationPath}" ]] && echo -n "true" || echo -n "false"`,
    ]);

    return result === 'true';
  }

  public async hasFile(destinationPath: string, filters: object = {}): Promise<boolean> {
    const parentDirectory: string = path.dirname(destinationPath);
    const fileName: string = path.basename(destinationPath);
    const filterMap: Map<string, string> = new Map(Object.entries(filters));

    try {
      const entries: TDirectoryData[] = await this.listDir(parentDirectory);

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found: boolean = true;

          for (const [field, value] of filterMap.entries()) {
            this.logger.debug(
              `Checking file ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}; ${field} expected ${value}, found ${item[field]}`,
              {filters},
            );
            if (`${value}` !== `${item[field]}`) {
              found = false;
              break;
            }
          }

          if (found) {
            this.logger.debug(
              `File check succeeded ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}`,
              {
                filters,
              },
            );
            return true;
          }
        }
      }
    } catch (error) {
      throw new SoloError(
        `unable to check file in '${this.containerReference.parentReference.name}':${this.containerReference.name}' - ${destinationPath}: ${error.message}`,
        error,
      );
    }

    return false;
  }

  public async listDir(destinationPath: string): Promise<TDirectoryData[]> {
    try {
      const output: string = await this.execContainer(['ls', '-la', destinationPath]);
      if (!output) {
        return [];
      }

      // parse the output and return the entries
      const items: TDirectoryData[] = [];
      const lines: string[] = output.split('\n');
      for (let line of lines) {
        line = line.replaceAll(/\s+/g, '|');
        const parts: string[] = line.split('|');
        if (parts.length >= 9) {
          let name: string = parts.at(-1) as string;
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let index: number = parts.length - 1; index > 8; index--) {
            name = `${parts[index - 1]} ${name}`;
          }

          if (name !== '.' && name !== '..') {
            const permission: string = parts[0];
            const item: TDirectoryData = {
              directory: permission[0] === 'd',
              owner: parts[2],
              group: parts[3],
              size: parts[4],
              modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
              name,
            };

            items.push(item);
          }
        }
      }

      return items;
    } catch (error) {
      throw new SoloError(
        `unable to check path in '${this.containerReference.parentReference.name}':${this.containerReference.name}' - ${destinationPath}: ${error.message}`,
        error,
      );
    }
  }

  public async mkdir(destinationPath: string): Promise<string> {
    return this.execContainer(['bash', '-c', `mkdir -p "${destinationPath}"`]);
  }
}
