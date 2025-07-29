// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../../../resources/pod/pod.js';
import {type ExtendedNetServer} from '../../../../../types/index.js';
import {findAvailablePort} from '../../../../../core/network/port-utilities.js';
import {PodReference} from '../../../resources/pod/pod-reference.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import {StatusCodes} from 'http-status-codes';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {
  type KubeConfig,
  type CoreV1Api,
  PortForward,
  V1Pod,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Probe,
  V1PodSpec,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import * as constants from '../../../../../core/constants.js';
import net from 'node:net';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {K8ClientPodCondition} from './k8-client-pod-condition.js';
import {type PodCondition} from '../../../resources/pod/pod-condition.js';
import {ShellRunner} from '../../../../../core/shell-runner.js';
import chalk from 'chalk';
import http from 'node:http';

export class K8ClientPod implements Pod {
  private readonly logger: SoloLogger;

  public constructor(
    public readonly podReference: PodReference,
    private readonly pods: Pods,
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
    public readonly labels?: Record<string, string>,
    public readonly startupProbeCommand?: string[],
    public readonly containerName?: ContainerName,
    public readonly containerImage?: string,
    public readonly containerCommand?: string[],
    public readonly conditions?: PodCondition[],
    public readonly podIp?: string,
    public readonly deletionTimestamp?: Date,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async killPod(): Promise<void> {
    try {
      const result = await this.kubeClient.deleteNamespacedPod(
        this.podReference.name.toString(),
        this.podReference.namespace.toString(),
        undefined,
        undefined,
        1,
      );

      if (result.response.statusCode !== StatusCodes.OK) {
        throw new SoloError(
          `Failed to delete pod ${this.podReference.name} in namespace ${this.podReference.namespace}: statusCode: ${result.response.statusCode}`,
        );
      }

      let podExists: boolean = true;
      while (podExists) {
        const pod: Pod = await this.pods.read(this.podReference);

        if (pod?.deletionTimestamp) {
          await sleep(Duration.ofSeconds(1));
        } else {
          podExists = false;
        }
      }
    } catch (error) {
      const errorMessage: string = `Failed to delete pod ${this.podReference.name.name} in namespace ${this.podReference.namespace}: ${error.message}`;

      if (error.body?.code === StatusCodes.NOT_FOUND || error.response?.body?.code === StatusCodes.NOT_FOUND) {
        this.logger.info(`Pod not found: ${errorMessage}`, error);
        return;
      }

      throw new SoloError(errorMessage, error);
    }
  }

  /**
   * Forward a local port to a port on the pod
   * @param localPort The local port to forward from
   * @param podPort The pod port to forward to
   * @param detach Whether to run the port forwarding in detached mode
   * @param reuse - if true, reuse the port number from previous port forward operation
   * @returns Promise resolving to the port forwarder server when not detached,
   *          or the port number (which may differ from localPort if it was in use) when detached
   */
  public async portForward(localPort: number, podPort: number, detach: true, reuse?: boolean): Promise<number>;
  public async portForward(
    localPort: number,
    podPort: number,
    detach?: false,
    reuse?: boolean,
  ): Promise<ExtendedNetServer>;
  public async portForward(
    localPort: number,
    podPort: number,
    detach: boolean = false,
    reuse: boolean = false,
  ): Promise<ExtendedNetServer | number> {
    let availablePort: number = localPort;

    try {
      if (reuse) {
        // use `ps -ef | grep "kubectl port-forward"`|grep ${this.podReference.name}
        // to find previous port-forward port number
        // example: ps -ef |grep port-forward |grep pods/haproxy-node1-7bb68675fc-t2q9q
        //   502 34727     1   0 11:43PM ??         0:00.16 kubectl port-forward -n solo-e2e pods/haproxy-node1-7bb68675fc-t2q9q 50211:50211
        const shellCommand: string = 'ps -ef';
        const shellArguments: string[] = [
          '|',
          'grep',
          'kubectl port-forward',
          '|',
          'grep',
          `${this.podReference.name}`,
        ];
        const shellRunner: ShellRunner = new ShellRunner();
        const result: string[] = await shellRunner.run(shellCommand, shellArguments, true, false);
        this.logger.info(`shell command result is ${result}`);
        // if length of result is 1 then could not find previous port forward running, then we can use next available port
        if (result.length === 1) {
          availablePort = await findAvailablePort(localPort, 30_000, this.logger);
        } else {
          // extract local port number from command output
          const splitArray = result[0].split(/\s+/).filter(Boolean);

          // The port number should be the last element in the command
          // It might be in the format localPort:podPort
          const lastElement = splitArray.at(-1);
          if (lastElement === undefined) {
            throw new SoloError(`Failed to extract port: lastElement is undefined in command output: ${result[0]}`);
          }
          const extractedString: string = lastElement.split(':')[0];
          this.logger.info(`extractedString = ${extractedString}`);
          const parsedPort = Number.parseInt(extractedString, 10);
          if (Number.isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
            this.logger.warn(`Invalid port extracted: ${extractedString}. Falling back to finding an available port.`);
            availablePort = await findAvailablePort(localPort, 30_000, this.logger);
          } else {
            availablePort = parsedPort;
            this.logger.info(`Reuse already enabled port ${availablePort}`);
          }
          // port forward already enabled
          return availablePort;
        }
      } else {
        // Find an available port starting from localPort with a 30-second timeout
        availablePort = await findAvailablePort(localPort, 30_000, this.logger);
      }
      if (availablePort === localPort) {
        this.logger.showUser(chalk.yellow(`Using requested port ${localPort}`));
      } else {
        this.logger.showUser(chalk.yellow(`Using available port ${availablePort}`));
      }
      this.logger.debug(
        `Creating port-forwarder for ${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${availablePort}`,
      );

      // first use http.request(url[, options][, callback]) GET method against localhost:localPort to kill any pre-existing
      // port-forward that is no longer active.  It doesn't matter what the response is.
      const url: string = `http://${constants.LOCAL_HOST}:${localPort}`;
      await new Promise<void>((resolve): void => {
        http
          .request(url, {method: 'GET'}, (response): void => {
            response.on('data', (): void => {
              // do nothing
            });
            response.on('end', (): void => {
              resolve();
            });
          })
          .on('error', (): void => {
            resolve();
          })
          .end();
      });

      // if detach is true, start a port-forwarder in detached mode
      if (detach) {
        this.logger.warn(
          'Port-forwarding in detached mode has to be manually stopped or will stop when the Kubernetes pod it ',
          'is connected to terminates.',
        );
        await new ShellRunner().run(
          `kubectl port-forward -n ${this.podReference.namespace.name} pods/${this.podReference.name} ${availablePort}:${podPort}`,
          [],
          false,
          true,
        );
        return availablePort;
      }

      const ns: NamespaceName = this.podReference.namespace;
      const forwarder: PortForward = new PortForward(this.kubeConfig, false);

      const server: ExtendedNetServer = (await net.createServer((socket): void => {
        forwarder.portForward(ns.name, this.podReference.name.toString(), [podPort], socket, undefined, socket, 3);
      })) as ExtendedNetServer;

      // add info for logging
      server.info = `${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${availablePort}`;
      server.localPort = availablePort;
      this.logger.debug(`Starting port-forwarder [${server.info}]`);
      return server.listen(availablePort, constants.LOCAL_HOST);
    } catch (error) {
      const message: string = `failed to start port-forwarder [${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${availablePort}]: ${error.message}`;
      throw new SoloError(message, error);
    }
  }

  public async stopPortForward(
    server: ExtendedNetServer,
    maxAttempts: number = 20,
    timeout: number = 500,
  ): Promise<void> {
    if (!server) {
      return;
    }

    this.logger.debug(`Stopping port-forwarder [${server.info}]`);

    // try to close the websocket server
    await new Promise<void>((resolve, reject): void => {
      server.close((error): void => {
        if (error) {
          if (error.message?.includes('Server is not running')) {
            this.logger.debug(`Server not running, port-forwarder [${server.info}]`);
            resolve();
          } else {
            this.logger.debug(`Failed to stop port-forwarder [${server.info}]: ${error.message}`, error);
            reject(error);
          }
        } else {
          this.logger.debug(`Stopped port-forwarder [${server.info}]`);
          resolve();
        }
      });
    });

    // test to see if the port has been closed or if it is still open
    let attempts: number = 0;
    while (attempts < maxAttempts) {
      let hasError: number = 0;
      attempts++;

      try {
        const isPortOpen: unknown = await new Promise((resolve): void => {
          const testServer: net.Server = net
            .createServer()
            .once('error', (error): void => {
              if (error) {
                resolve(false);
              }
            })
            .once('listening', (): void => {
              testServer
                .once('close', (): void => {
                  hasError++;
                  if (hasError > 1) {
                    resolve(false);
                  } else {
                    resolve(true);
                  }
                })
                .close();
            })
            .listen(server.localPort, '0.0.0.0');
        });
        if (isPortOpen) {
          return;
        }
      } catch {
        return;
      }
      await sleep(Duration.ofMillis(timeout));
    }
    if (attempts >= maxAttempts) {
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`);
    }
  }

  public static toV1Pod(pod: Pod): V1Pod {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = pod.podReference.name.toString();
    v1Metadata.namespace = pod.podReference.namespace.toString();
    v1Metadata.labels = pod.labels;

    const v1ExecAction: V1ExecAction = new V1ExecAction();
    v1ExecAction.command = pod.startupProbeCommand;

    const v1Probe: V1Probe = new V1Probe();
    v1Probe.exec = v1ExecAction;

    const v1Container: V1Container = new V1Container();
    v1Container.name = pod.containerName.name;
    v1Container.image = pod.containerImage;
    v1Container.command = pod.containerCommand;
    v1Container.startupProbe = v1Probe;

    const v1Spec: V1PodSpec = new V1PodSpec();
    v1Spec.containers = [v1Container];

    const v1Pod: V1Pod = new V1Pod();
    v1Pod.metadata = v1Metadata;
    v1Pod.spec = v1Spec;

    return v1Pod;
  }

  public static fromV1Pod(v1Pod: V1Pod, pods: Pods, coreV1Api: CoreV1Api, kubeConfig: KubeConfig): Pod {
    if (!v1Pod) {
      return undefined;
    }

    return new K8ClientPod(
      PodReference.of(NamespaceName.of(v1Pod.metadata?.namespace), PodName.of(v1Pod.metadata?.name)),
      pods,
      coreV1Api,
      kubeConfig,
      v1Pod.metadata.labels,
      v1Pod.spec.containers[0]?.startupProbe?.exec?.command,
      ContainerName.of(v1Pod.spec.containers[0]?.name),
      v1Pod.spec.containers[0]?.image,
      v1Pod.spec.containers[0]?.command,
      v1Pod.status?.conditions?.map(
        (condition): K8ClientPodCondition => new K8ClientPodCondition(condition.type, condition.status),
      ),
      v1Pod.status?.podIP,
      v1Pod.metadata.deletionTimestamp ? new Date(v1Pod.metadata.deletionTimestamp) : undefined,
    );
  }
}
