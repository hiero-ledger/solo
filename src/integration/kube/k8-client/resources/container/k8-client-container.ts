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
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {spawn} from 'node:child_process';

export class K8ClientContainer implements Container {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly containerReference: ContainerReference,
    private readonly pods: Pods,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  private execKubectl(arguments_: string[]): Promise<string> {
    return new Promise((resolve, reject): void => {
      // eslint-disable-next-line @typescript-eslint/typedef
      const proc = spawn('kubectl', arguments_, {stdio: ['ignore', 'pipe', 'pipe']});

      let stdout: string = '';
      let stderr: string = '';

      proc.stdout.on('data', (chunk): string => (stdout += chunk.toString()));
      proc.stderr.on('data', (chunk): string => (stderr += chunk.toString()));

      proc.on('close', (code): void => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new SoloError(`kubectl failed: ${stderr || stdout}`));
        }
      });
    });
  }

  public async copyFrom(sourcePath: string, destinationDirectory: string): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();

    if (!(await this.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${podName}`);
    }

    if (!fs.existsSync(destinationDirectory)) {
      throw new SoloError(`invalid destination path: ${destinationDirectory}`);
    }

    const destinationPath: string = path.join(destinationDirectory, path.basename(sourcePath));

    this.logger.info(`copyFrom: kubectl cp ${namespace.name}/${podName}:${sourcePath} ${destinationPath}`);

    await this.execKubectl(['cp', `${namespace.name}/${podName}:${sourcePath}`, destinationPath]);

    return true;
  }

  public async copyTo(sourcePath: string, destinationDirectory: string): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();

    if (!(await this.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${podName}`);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloError(`invalid source path: ${sourcePath}`);
    }

    // "<pod>:dir" as directory destination
    const remoteDestination: string = `${namespace.name}/${podName}:${destinationDirectory}`;

    this.logger.info(`copyTo: kubectl cp ${sourcePath} ${remoteDestination}`);

    await this.execKubectl(['cp', sourcePath, remoteDestination]);

    return true;
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
      `execContainer: kubectl exec ${podName} -n ${namespace.name} -c ${containerName} -- ${command.join(' ')}`,
    );

    const arguments_: string[] = ['exec', podName, '-n', namespace.name, '-c', containerName, '--', ...command];

    const output: string = await this.execKubectl(arguments_);

    return output.trim();
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

    const entries: TDirectoryData[] = await this.listDir(parentDirectory);
    for (const item of entries) {
      if (item.name === fileName && !item.directory) {
        return true;
      }
    }
    return false;
  }

  public async listDir(destinationPath: string): Promise<TDirectoryData[]> {
    const output: string = await this.execContainer(['ls', '-la', destinationPath]);
    if (!output) {
      return [];
    }

    const items: TDirectoryData[] = [];
    const lines: string[] = output.split('\n');

    for (let line of lines) {
      line = line.replaceAll(/\s+/g, '|');
      const parts: string[] = line.split('|');
      if (parts.length >= 9) {
        let name: string = parts.at(-1);
        for (let index: number = parts.length - 1; index > 8; index--) {
          name = `${parts[index - 1]} ${name}`;
        }
        if (name !== '.' && name !== '..') {
          const permission: string = parts[0];
          items.push({
            directory: permission[0] === 'd',
            owner: parts[2],
            group: parts[3],
            size: parts[4],
            modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
            name,
          });
        }
      }
    }
    return items;
  }

  public async mkdir(destinationPath: string): Promise<string> {
    return this.execContainer(['mkdir', '-p', destinationPath]);
  }
}
