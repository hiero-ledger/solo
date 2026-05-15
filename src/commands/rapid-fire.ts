// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReferenceName,
  type DeploymentName,
  type Optional,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {injectable} from 'tsyringe-neo';
import {
  MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
} from '../../version.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import * as helpers from '../core/helpers.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {type Pods} from '../integration/kube/resources/pod/pods.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Containers} from '../integration/kube/resources/container/containers.js';
import {Container} from '../integration/kube/resources/container/container.js';
import chalk from 'chalk';
import {PassThrough} from 'node:stream';
import fs from 'node:fs';
import {PathEx} from '../business/utils/path-ex.js';

interface RapidFireStartConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  valuesArg: string;
  nlgArguments: string;
  parsedNlgArguments: string;
  javaHeap: number;
  performanceTest: string;
  packageName: string;
  maxTps: number;
}

interface RapidFireStopConfigClass {
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  clusterRef: ClusterReferenceName;
  performanceTest: string;
  packageName: string;
}

interface RapidFireStartContext {
  config: RapidFireStartConfigClass;
}

interface RapidFireStopContext {
  config: RapidFireStopConfigClass;
}

interface NlgResult {
  status: 'success' | 'zero-tps' | 'no-result';
  testClass: string;
  performanceTest: string;
  transactionCount?: number;
  durationSeconds?: number;
  tps?: number;
  hint?: string;
}

export enum NLGTestClass {
  HCSLoadTest = 'HCSLoadTest',
  CryptoTransferLoadTest = 'CryptoTransferLoadTest',
  NftTransferLoadTest = 'NftTransferLoadTest',
  TokenTransferLoadTest = 'TokenTransferLoadTest',
  SmartContractLoadTest = 'SmartContractLoadTest',
  HeliSwapLoadTest = 'HeliSwapLoadTest',
  LongevityLoadTest = 'LongevityLoadTest',
}

@injectable()
export class RapidFireCommand extends BaseCommand {
  public constructor() {
    super();
  }

  private static readonly CRYPTO_TRANSFER_START_CONFIG_NAME: string = 'cryptoTransferStartConfig';
  private static readonly STOP_CONFIG_NAME: string = 'stopConfig';

  public static readonly START_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.nlgArguments, flags.performanceTest],
    optional: [
      flags.devMode,
      flags.force,
      flags.quiet,
      flags.valuesFile,
      flags.javaHeap,
      flags.packageName,
      flags.maxTps,
    ],
  };

  public static readonly STOP_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.performanceTest],
    optional: [flags.devMode, flags.force, flags.quiet, flags.packageName],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.devMode, flags.force, flags.quiet],
  };

  private nglChartIsDeployed(context_: RapidFireStartContext): Promise<boolean> {
    return this.chartManager.isChartInstalled(
      context_.config.namespace,
      constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
      context_.config.context,
    );
  }

  private deployNlgChart(): SoloListrTask<RapidFireStartContext> {
    return {
      title: 'Deploy Network Load Generator chart',
      task: (context_, task): SoloListr<RapidFireStartContext> => {
        const subTasks: SoloListrTask<RapidFireStartContext>[] = [
          {
            title: 'Install Network Load Generator chart',
            task: async (context_): Promise<void> => {
              let valuesArgument: string = helpers.prepareValuesFiles(constants.RAPID_FIRE_VALUES_FILE);

              if (context_.config.valuesFile) {
                valuesArgument += helpers.prepareValuesFiles(context_.config.valuesFile);
              }

              const haproxyPods: Pod[] = await this.k8Factory
                .getK8(context_.config.context)
                .pods()
                .list(context_.config.namespace, ['solo.hedera.com/type=haproxy']);

              const port: number = constants.GRPC_PORT;
              const networkProperties: string[] = haproxyPods.map((pod: Pod) => {
                const accountId: string = pod.labels['solo.hedera.com/account-id'] ?? 'unknown';
                // Using multiple backslashes to ensure it is not stripped when the network.properties file is generated
                // Final result should look like: x.x.x.x\:50211=0.0.y
                return String.raw`${pod.podIp}\\\:${port}=${accountId}`;
              });

              for (const row of networkProperties) {
                valuesArgument += ` --set loadGenerator.properties[${networkProperties.indexOf(row)}]="${row}"`;
              }

              const consensusNodeVersion: string = this.remoteConfig.configuration.versions.consensusNode.toString();
              await this.chartManager.install(
                context_.config.namespace,
                constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
                constants.NETWORK_LOAD_GENERATOR_CHART,
                constants.NETWORK_LOAD_GENERATOR_CHART_URL,
                new SemanticVersion(consensusNodeVersion).greaterThanOrEqual(
                  new SemanticVersion(MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR),
                )
                  ? NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72
                  : NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
                valuesArgument,
                context_.config.context,
              );
            },
          },
          {
            title: 'Check NLG pod is ready',
            task: async ({config}): Promise<void> => {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  constants.NETWORK_LOAD_GENERATOR_POD_LABELS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY,
                );
            },
          },
          {
            title: 'Install libraries in NLG pod',
            task: async ({config}): Promise<void> => {
              const nlgPods: Pod[] = await this.k8Factory
                .getK8(config.context)
                .pods()
                .list(config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
              const k8Containers: Containers = this.k8Factory.getK8(config.context).containers();

              for (const pod of nlgPods) {
                const containerReference: ContainerReference = ContainerReference.of(
                  pod.podReference,
                  constants.NETWORK_LOAD_GENERATOR_CONTAINER,
                );
                const container: Container = k8Containers.readByRef(containerReference);
                await container.execContainer('apt-get update -qq');
                await container.execContainer('apt-get install -y libsodium23');
                await container.execContainer('apt-get clean -qq');
              }
            },
          },
        ];

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
      skip: this.nglChartIsDeployed.bind(this),
    };
  }

  private startLoadTest(leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStartContext> {
    return {
      title: 'Start performance load test',
      task: async (
        context_: RapidFireStartContext,
        task: SoloListrTaskWrapper<RapidFireStartContext>,
      ): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Start performance load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          const outputStream: PassThrough = new PassThrough();
          const errorStream: PassThrough = new PassThrough();
          const stdoutBuffer: string[] = [];
          const stderrBuffer: string[] = [];
          outputStream.on('data', (chunk: Buffer): void => {
            const string_: string = chunk.toString();
            stdoutBuffer.push(string_);
            task.output = (task.output || '') + chalk.gray(string_);
          });
          errorStream.on('data', (chunk: Buffer): void => {
            const string_: string = chunk.toString();
            stderrBuffer.push(string_);
            task.output = (task.output || '') + chalk.gray(string_);
          });

          let execError: Error | undefined;
          try {
            if (!this.oneShotState.isActive()) {
              await leaseReference.lease?.release();
            }
            const tpsSetting: string = context_.config.maxTps ? `-Dbenchmark.maxtps=${context_.config.maxTps}` : '';
            const consensusNodeVersion: string = this.remoteConfig.configuration.versions.consensusNode.toString();
            const nlgVersion: string = new SemanticVersion(consensusNodeVersion).greaterThanOrEqual(
              new SemanticVersion(MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR),
            )
              ? NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72
              : NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72;
            let commandString: string = `/usr/bin/env java -Xmx${context_.config.javaHeap}g ${tpsSetting} -cp /app/lib/*:/app/network-load-generator-${nlgVersion}.jar ${testClass} ${context_.config.parsedNlgArguments}`;
            commandString = commandString.replaceAll('  ', ' ').trim();
            await container.execContainer(commandString, outputStream, errorStream);
          } catch (error) {
            execError = error instanceof Error ? error : new Error(String(error));
          }

          if (task.output) {
            const showOutput: string = '>   ' + task.output.replaceAll('\n', '\n    ');
            this.logger.showUser(showOutput);
          }

          const stdoutText: string = stdoutBuffer.join('');
          const stderrText: string = stderrBuffer.join('');
          const result: NlgResult = RapidFireCommand.analyzeNlgOutput(
            stdoutText + stderrText,
            testClass,
            performanceTest,
          );

          if (execError || result.status !== 'success') {
            const diagnosticsFilePath: string = await this.collectFailureDiagnostics(
              context_.config.context,
              context_.config.namespace,
              testClass,
              stdoutText,
              stderrText,
              result,
              execError,
            );
            throw new SoloError(
              RapidFireCommand.buildFailureMessage(result, execError, stdoutText, stderrText, diagnosticsFilePath),
            );
          }

          this.logger.showUser(
            chalk.green(
              `${testClass}: TPS ${result.tps} (${result.transactionCount} transactions in ${result.durationSeconds} sec)`,
            ),
          );
        }
      },
    };
  }

  // Pattern: "Finished <TestClass>: ... in S sec, TPS: M"
  // NLG formats vary by test class, for example:
  //   TokenTransferLoadTest:  "500 transferred in 300 sec, TPS: 100"  (N word in)
  //   HCSLoadTest:            "28483 messages sent in 288 sec, TPS: 98"  (N word word in)
  //   SmartContractLoadTest:  "made 29077 calls in 297 sec, TPS: 97"  (word N word in)
  // .*? skips any prefix before the count; (?:\w+\s+)+ matches one or more unit words after it.
  private static readonly NLG_FINISHED_PATTERN: RegExp =
    /Finished\s+([\w.]+):.*?(\d+)\s+(?:\w+\s+)+in\s+(\d+)\s+sec,\s+TPS:\s+(\d+)/;

  private static analyzeNlgOutput(output: string, testClass: string, performanceTest: string): NlgResult {
    const lines: string[] = output.split('\n');
    let lastMatch: RegExpMatchArray | undefined;
    for (const line of lines) {
      const match: RegExpMatchArray | null = line.match(RapidFireCommand.NLG_FINISHED_PATTERN);
      if (match && (match[1] === performanceTest || match[1] === testClass)) {
        lastMatch = match;
      }
    }

    if (!lastMatch) {
      return {
        status: 'no-result',
        testClass,
        performanceTest,
        hint: RapidFireCommand.classifyFailure(output),
      };
    }

    const transactionCount: number = Number.parseInt(lastMatch[2], 10);
    const durationSeconds: number = Number.parseInt(lastMatch[3], 10);
    const tps: number = Number.parseInt(lastMatch[4], 10);

    if (tps === 0) {
      return {
        status: 'zero-tps',
        testClass,
        performanceTest,
        transactionCount,
        durationSeconds,
        tps,
        hint: RapidFireCommand.classifyFailure(output),
      };
    }

    return {
      status: 'success',
      testClass,
      performanceTest,
      transactionCount,
      durationSeconds,
      tps,
    };
  }

  // Returns a short hint string based on patterns found in the NLG output.
  private static classifyFailure(output: string): string | undefined {
    if (/INVALID_TOKEN_FOR_NFT_TRANSACTION|TOKEN_NOT_ASSOCIATED_TO_ACCOUNT|INVALID_TOKEN_ID/.test(output)) {
      return 'token-type / association mismatch detected (e.g. trying fungible transfer against NFT tokens from a previous reused run — consider dropping -R or running TokenTransferLoadTest before NftTransferLoadTest)';
    }
    // Silent zero-TPS: FungibleTransferJob ran for the full duration with 0 transfers.
    // This happens when TokenTransferLoadTest runs after NftTransferLoadTest with -R:
    // it silently reuses the NFT tokens as fungible, every CryptoTransfer fails,
    // and the NLG just reports "Finished ... 0 transfers ... TPS: 0" with no exception.
    if (/FungibleTransferJob.*Starting token transfer/.test(output)) {
      return 'FungibleTransferJob ran but recorded 0 transfers — all transactions likely rejected because existing tokens are NFTs (reused from a prior NftTransferLoadTest run); run TokenTransferLoadTest before NftTransferLoadTest, or drop -R to force fresh fungible token creation';
    }
    if (/BUSY|THROTTLED_AT_CONSENSUS|PLATFORM_NOT_ACTIVE/.test(output)) {
      return 'consensus node reported throttling or backpressure (BUSY/THROTTLED_AT_CONSENSUS/PLATFORM_NOT_ACTIVE) — increase cool-down between tests or lower max-tps';
    }
    if (/UNAVAILABLE|Connection refused|UNAUTHENTICATED|DEADLINE_EXCEEDED/.test(output)) {
      return 'gRPC transport error (UNAVAILABLE/DEADLINE_EXCEEDED/connection refused) — check haproxy and consensus-node pod health';
    }
    if (/OutOfMemoryError|java\.lang\.OutOfMemory/.test(output)) {
      return 'NLG process ran out of heap — raise --java-heap';
    }
    if (/Exception in thread|Caused by:|java\.lang\.|com\.hedera\..*Exception/.test(output)) {
      return 'Java exception thrown inside NLG — see stderr extract above and full output in diagnostics file';
    }
    return undefined;
  }

  private static buildFailureMessage(
    result: NlgResult,
    execError: Error | undefined,
    stdoutText: string,
    stderrText: string,
    diagnosticsFilePath: string,
  ): string {
    const lines: string[] = [];
    if (execError) {
      lines.push(`NLG process error: ${execError.message}`);
    }
    switch (result.status) {
      case 'zero-tps': {
        lines.push(
          `${result.testClass} completed with TPS: 0 (${result.transactionCount} transactions in ${result.durationSeconds} sec). No transactions were processed.`,
        );
        break;
      }
      case 'no-result': {
        lines.push(
          `${result.testClass} produced no "Finished <test>: ... TPS: N" result line. The NLG process exited or hung without reporting a benchmark result.`,
        );
        break;
      }
      // success case handled by caller
    }
    if (result.hint) {
      lines.push(`hint: ${result.hint}`);
    }
    const stderrTail: string = RapidFireCommand.tailLines(stderrText, 20);
    if (stderrTail) {
      lines.push(`--- last 20 stderr lines ---\n${stderrTail}`);
    }
    const stdoutTail: string = RapidFireCommand.tailLines(stdoutText, 30);
    if (stdoutTail) {
      lines.push(`--- last 30 stdout lines ---\n${stdoutTail}`);
    }
    lines.push(`Full output and cluster diagnostics written to ${diagnosticsFilePath}`);
    return lines.join('\n');
  }

  private static tailLines(text: string, count: number): string {
    if (!text) {
      return '';
    }
    return text.replace(/\n+$/, '').split('\n').slice(-count).join('\n');
  }

  // Best-effort: returns appendable diagnostic sections for network-node and haproxy pods.
  // Each pod's last 200 log lines are extracted. Failures are recorded inline.
  private async collectPodLogSections(context: string, namespace: NamespaceName): Promise<string[]> {
    const podsApi: Pods = this.k8Factory.getK8(context).pods();
    const podLogTargets: {label: string; selector: string}[] = [
      {label: 'network-node', selector: 'solo.hedera.com/type=network-node'},
      {label: 'haproxy', selector: 'solo.hedera.com/type=haproxy'},
    ];
    const result: string[] = [];
    for (const target of podLogTargets) {
      let pods: Pod[];
      try {
        pods = await podsApi.list(namespace, [target.selector]);
      } catch (error) {
        result.push(
          '',
          `==== ${target.label} pods (list failed) ====`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
      for (const pod of pods) {
        const header: string = `==== ${target.label} pod ${pod.podReference.name.toString()} (last 200 lines) ====`;
        try {
          const log: string = await podsApi.readLogs(pod.podReference);
          result.push('', header, RapidFireCommand.tailLines(log, 200));
        } catch (error) {
          result.push('', header, `Failed to read logs: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return result;
  }

  // Best-effort: write a diagnostics file capturing full NLG output plus
  // consensus-node and haproxy pod logs (last 200 lines each). Returns the
  // file path even if some log fetches fail.
  private async collectFailureDiagnostics(
    context: string,
    namespace: NamespaceName,
    testClass: string,
    stdoutText: string,
    stderrText: string,
    result: NlgResult,
    execError: Error | undefined,
  ): Promise<string> {
    const timestamp: string = new Date().toISOString().replaceAll(':', '-');
    const safeTestClass: string = testClass.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
    const fileName: string = `rapid-fire-failure-${safeTestClass}-${timestamp}.log`;
    const filePath: string = PathEx.join(constants.SOLO_LOGS_DIR, fileName);

    const headerLines: string[] = [
      '==== rapid-fire failure diagnostics ====',
      `time:        ${new Date().toISOString()}`,
      `testClass:   ${testClass}`,
      `status:      ${result.status}`,
    ];
    if (result.tps !== undefined) {
      headerLines.push(
        `tps:         ${result.tps}`,
        `transactions:${result.transactionCount}`,
        `duration:    ${result.durationSeconds}s`,
      );
    }
    if (result.hint) {
      headerLines.push(`hint:        ${result.hint}`);
    }
    if (execError) {
      headerLines.push(`execError:   ${execError.message}`);
    }

    const sections: string[] = [
      ...headerLines,
      '',
      '==== NLG stdout (full) ====',
      stdoutText || '(empty)',
      '',
      '==== NLG stderr (full) ====',
      stderrText || '(empty)',
      ...(await this.collectPodLogSections(context, namespace)),
    ];

    try {
      fs.mkdirSync(constants.SOLO_LOGS_DIR, {recursive: true});
      fs.writeFileSync(filePath, sections.join('\n'), 'utf8');
      this.logger.info(`Wrote rapid-fire failure diagnostics to ${filePath}`);
    } catch (error) {
      this.logger.error(
        `Failed to write rapid-fire failure diagnostics to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return filePath;
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task

    const tasks: Listr<RapidFireStartContext, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              leaseReference.lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(RapidFireCommand.START_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RapidFireCommand.START_FLAGS_LIST.required,
              ...RapidFireCommand.START_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: RapidFireStartConfigClass = this.configManager.getConfig(
              RapidFireCommand.CRYPTO_TRANSFER_START_CONFIG_NAME,
              allFlags,
              ['parsedNlgArguments'],
            ) as RapidFireStartConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            // Parse nlgArguments to remove any surrounding quotes
            config.parsedNlgArguments = config.nlgArguments.replaceAll("'", '').replaceAll('"', '');

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(leaseReference.lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.deployNlgChart(),
        this.startLoadTest(leaseReference),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire: ${error.message}`, error);
    } finally {
      if (!this.oneShotState.isActive()) {
        await leaseReference.lease?.release();
      }
    }

    return true;
  }

  private stopInitializeTask(argv: ArgvStruct, leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Initialize',
      task: async (context_, task): Promise<Listr<AnyListrContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv);
        if (!this.oneShotState.isActive()) {
          leaseReference.lease = await this.leaseManager.create();
        }

        this.configManager.update(argv);

        flags.disablePrompts(RapidFireCommand.STOP_FLAGS_LIST.optional);

        const allFlags: CommandFlag[] = [
          ...RapidFireCommand.STOP_FLAGS_LIST.required,
          ...RapidFireCommand.STOP_FLAGS_LIST.optional,
        ];

        await this.configManager.executePrompt(task, allFlags);

        const config: RapidFireStopConfigClass = this.configManager.getConfig(
          RapidFireCommand.STOP_CONFIG_NAME,
          allFlags,
        ) as RapidFireStopConfigClass;

        config.namespace = await this.getNamespace(task);
        config.clusterRef = this.getClusterReference();
        config.context = this.getClusterContext(config.clusterRef);
        context_.config = config;

        if (!this.oneShotState.isActive()) {
          return ListrLock.newAcquireLockTask(leaseReference.lease, task);
        }
        return ListrLock.newSkippedLockTask(task);
      },
    };
  }

  private async allStopTasks(argv: ArgvStruct, stopTask: SoloListrTask<RapidFireStopContext>): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: Listr<RapidFireStopContext, any, any> = new Listr(
      [this.stopInitializeTask(argv, leaseReference), stopTask],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire stop: ${error.message}`, error);
    } finally {
      if (!this.oneShotState.isActive() && leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  private stopLoadTest(): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Stop load test',
      task: async (context_: RapidFireStopContext, task: SoloListrTaskWrapper<RapidFireStopContext>): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Stop load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          try {
            await container.execContainer(`pkill -f ${testClass}`);
          } catch (error) {
            throw new SoloError(`Error stopping ${testClass} load test: ${error.message}`, error);
          }
        }
      },
    };
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: Listr<RapidFireStopContext, any, any> = new Listr(
      [this.stopInitializeTask(argv, leaseReference), this.stopLoadTest()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire stop: ${error.message}`, error);
    } finally {
      if (!this.oneShotState.isActive() && leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.allStopTasks(argv, {
      title: 'Uninstall Network Load Generator chart',
      task: async (context_): Promise<void> => {
        await this.chartManager.uninstall(
          context_.config.namespace,
          constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
          context_.config.context,
        );
      },
    });
  }

  public async close(): Promise<void> {} // no-op
}
