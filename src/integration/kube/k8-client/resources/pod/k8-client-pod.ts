// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../../../resources/pod/pod.js';
import {PortUtilities} from '../../../../../business/utils/port-utilities.js';
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
  V1Pod,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Probe,
  V1PodSpec,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import * as constants from '../../../../../core/constants.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {K8ClientPodCondition} from './k8-client-pod-condition.js';
import {type PodCondition} from '../../../resources/pod/pod-condition.js';
import {ShellRunner} from '../../../../../core/shell-runner.js';
import chalk from 'chalk';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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
      const result: {response: http.IncomingMessage; body: V1Pod} = await this.kubeClient.deleteNamespacedPod(
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
   * @param reuse - if true, reuse the port number from previous port forward operation
   * @param persist - if true, errors in port-forwarding will restart the port-forwarding, even after ts process has ended
   * @returns Promise resolving to the port forwarder server when not detached,
   *          or the port number (which may differ from localPort if it was in use) when detached
   */
  public async portForward(
    localPort: number,
    podPort: number,
    reuse?: boolean,
    persist: boolean = false,
  ): Promise<number> {
    let availablePort: number = localPort;

    try {
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
          .on('close', (): void => {
            resolve();
          })
          .on('timeout', (): void => {
            resolve();
          })
          .on('information', (): void => {
            resolve();
          })
          .on('error', (): void => {
            resolve();
          })
          .setTimeout(Duration.ofMinutes(5).toMillis())
          .end();
      });
      this.logger.debug(`Returned from http request against http://${constants.LOCAL_HOST}:${localPort}`);

      if (reuse) {
        // use `ps -ef | grep "kubectl port-forward"`|grep ${this.podReference.name}
        // to find previous port-forward port number
        const shellCommand: string[] = [
          'ps',
          '-ef',
          '|',
          'grep',
          'port-forward',
          '|',
          'grep',
          `${this.podReference.name}`,
        ];
        const shellRunner: ShellRunner = new ShellRunner();
        let result: string[];
        try {
          result = await shellRunner.run(shellCommand.join(' '), [], true, false);
        } catch (error) {
          this.logger.error(`Failed to execute shell command: ${shellCommand.join(' ')}`);
          this.logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          throw new SoloError(
            `Shell command execution failed: ${shellCommand.join(' ')}. Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        this.logger.debug(`ps -ef port-forward command result is ${result}`);

        // if length of result is 1 then could not find previous port forward running, then we can use next available port
        if (!result || result.length === 0) {
          this.logger.warn(`Shell command returned no output: ${shellCommand.join(' ')}`);
        }
        if (result.length > 1) {
          // extract local port number from command output
          const splitArray: string[] = result[0].split(/\s+/).filter(Boolean);

          // The port number should be the last element in the command
          // It might be in the format localPort:podPort
          const lastElement: string = splitArray.at(-1);
          if (lastElement === undefined) {
            throw new SoloError(`Failed to extract port: lastElement is undefined in command output: ${result[0]}`);
          }
          const extractedString: string = lastElement.split(':')[0];
          this.logger.debug(`extractedString = ${extractedString}`);
          const parsedPort: number = Number.parseInt(extractedString, 10);
          if (Number.isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
            throw new SoloError(`Invalid port extracted: ${extractedString}.`);
          } else {
            availablePort = parsedPort;
            this.logger.info(`Reuse already enabled port ${availablePort}`);
          }
          // port forward already enabled
          return availablePort;
        }
      }

      // Find an available port starting from localPort with a 30-second timeout
      availablePort = await PortUtilities.findAvailablePort(localPort, Duration.ofSeconds(30).toMillis(), this.logger);

      if (availablePort === localPort) {
        this.logger.showUser(chalk.yellow(`Using requested port ${localPort}`));
      } else {
        this.logger.showUser(chalk.yellow(`Using available port ${availablePort}`));
      }
      this.logger.debug(
        `Creating port-forwarder for ${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${availablePort}`,
      );

      this.logger.warn(
        'Port-forwarding in detached mode has to be manually stopped or will stop when the Kubernetes pod it ',
        'is connected to terminates.',
      );

      // If the persist flag is set, we need to run the port-forward in a detached process that restarts on failure even after the typescript process ends.
      const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
      const persistPortForwardScriptPath: string = path.resolve(__dirname, 'persist-port-forward.js');

      const cmd: string = persist
        ? `node ${persistPortForwardScriptPath} ${this.podReference.namespace.name} pods/${this.podReference.name} ${this.kubeConfig.currentContext} ${availablePort}:${podPort} &`
        : `kubectl port-forward -n ${this.podReference.namespace.name} --context ${this.kubeConfig.currentContext} pods/${this.podReference.name} ${availablePort}:${podPort}`;

      await new ShellRunner().run(cmd, [], true, true);

      return availablePort;
    } catch (error) {
      const message: string = `failed to start port-forwarder [${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${availablePort}]: ${error.message}`;
      throw new SoloError(message, error);
    }
  }

  public async stopPortForward(port: number): Promise<void> {
    if (!port) {
      return;
    }

    this.logger.showUser(chalk.yellow(`Stopping port-forwarder for port [${port}]`));

    try {
      // Use ps -ef | grep "port-forward" | grep ${port}: to find kubectl port-forward processes using the specified port
      const shellCommand: string[] = ['ps', '-ef', '|', 'grep', 'port-forward', '|', 'grep', `${port}:`];
      const shellRunner: ShellRunner = new ShellRunner();
      let result: string[];
      try {
        result = await shellRunner.run(shellCommand.join(' '), [], true, false);
      } catch (error) {
        this.logger.error(`Failed to execute shell command: ${shellCommand.join(' ')}`);
        this.logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        throw new SoloError(
          `Shell command execution failed: ${shellCommand.join(' ')}. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.logger.debug(`ps -ef port-forward command result is ${result}`);

      // if length of result is 0 then could not find port forward running for this port
      if (!result || result.length === 0) {
        this.logger.debug(`No port-forward processes found for port ${port}`);
        return;
      }

      // Extract PIDs and kill the processes
      for (const processLine of result) {
        // Process line format: UID PID PPID C STIME TTY TIME CMD
        // Split by whitespace and get the PID (second column)
        const parts: string[] = processLine.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid: string = parts[1];

          // Validate that PID is a number
          if (/^\d+$/.test(pid)) {
            this.logger.debug(`Killing port-forward process PID: ${pid}`);

            try {
              // Try SIGTERM first (graceful shutdown)
              await shellRunner.run(`kill -TERM ${pid}`, [], false, false);

              this.logger.debug(`Successfully sent SIGTERM to PID: ${pid}`);

              // Wait a moment for graceful shutdown
              await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 1000));

              // Check if process is still running
              const checkResult: string[] = await shellRunner.run(`ps -p ${pid}`, [], false, false);

              // If process still exists, use SIGKILL
              if (checkResult.length > 1) {
                // ps header + process line
                this.logger.debug(`Process ${pid} still running, sending SIGKILL`);
                await shellRunner.run(`kill -KILL ${pid}`, [], false, false);
              }
            } catch (killError) {
              this.logger.warn(`Failed to kill process ${pid}: ${killError.message}`);
            }
          }
        }
      }

      this.logger.debug(`Finished stopping port-forwarder for port [${port}]`);
    } catch (error) {
      const errorMessage: string = `Error stopping port-forwarder for port ${port}: ${error.message}`;
      this.logger.error(errorMessage);
      throw new SoloError(errorMessage, error);
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
