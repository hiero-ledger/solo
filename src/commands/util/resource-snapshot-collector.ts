// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import chalk from 'chalk';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8} from '../../integration/kube/k8.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type PodMetricsItem} from '../../integration/kube/resources/pod/pod-metrics-item.js';
import {type ContainerStatus} from '../../integration/kube/resources/pod/container-status.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyListrContext} from '../../types/aliases.js';
import {type SoloListrTask} from '../../types/index.js';
import {type PodResourceRow} from './pod-resource-row.js';

/**
 * Collects a point-in-time snapshot of where cluster resources are going (per-pod CPU/memory,
 * restarts, container states, Docker host usage and VM clock drift) so a runaway deployment, for
 * example a network left running until Docker pins every CPU core, can be diagnosed from the
 * diagnostics bundle. Every source is best-effort: a missing metrics-server, Docker CLI or
 * cluster never fails the diagnostics command.
 */
export class ResourceSnapshotCollector {
  public static readonly DIRECTORY_NAME: string = 'resource-snapshot';

  private static readonly DOCKER_COMMAND_TIMEOUT_MS: number = 30_000;
  private static readonly KIND_CLUSTER_LABEL: string = 'io.x-k8s.kind.cluster';
  private static readonly TOP_CPU_POD_DESCRIBE_COUNT: number = 3;
  private static readonly MAX_DESCRIBED_PODS: number = 10;
  private static readonly SUMMARY_TOP_POD_COUNT: number = 3;
  private static readonly DOCKER_CPU_WARNING_PERCENT: number = 100;
  private static readonly DOCKER_MEMORY_WARNING_PERCENT: number = 80;
  private static readonly CLOCK_DRIFT_WARNING_SECONDS: number = 5;

  /**
   * Builds a Listr task that writes the resource snapshot into `<outputDirectory>/resource-snapshot`.
   * Set `includePodSpecs` to false to omit pod describe reports (which embed env var values).
   */
  public static collect(
    k8Factory: K8Factory,
    logger: SoloLogger,
    outputDirectory: string,
    scopeToSelectedDeployment: boolean = false,
    includePodSpecs: boolean = true,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Collect resource usage snapshot',
      task: async (context_: AnyListrContext): Promise<void> => {
        const snapshotDirectory: string = PathEx.join(
          outputDirectory || constants.SOLO_LOGS_DIR,
          ResourceSnapshotCollector.DIRECTORY_NAME,
        );

        try {
          fs.mkdirSync(snapshotDirectory, {recursive: true});
        } catch (error) {
          logger.warn(`Failed to create resource snapshot directory ${snapshotDirectory}: ${(error as Error).message}`);
          return;
        }

        await ResourceSnapshotCollector.collectDockerHost(logger, snapshotDirectory);

        const scopedContexts: string[] | undefined = scopeToSelectedDeployment ? context_?.config?.contexts : undefined;
        const scopedNamespace: NamespaceName | undefined = scopeToSelectedDeployment
          ? context_?.config?.namespace
          : undefined;

        try {
          const contexts: string[] = k8Factory.default().contexts().list();
          for (const context of contexts) {
            if (scopedContexts !== undefined && !scopedContexts.includes(context)) {
              continue;
            }
            await ResourceSnapshotCollector.collectCluster(
              k8Factory.getK8(context),
              context,
              logger,
              snapshotDirectory,
              scopedNamespace,
              includePodSpecs,
            );
          }
        } catch (error) {
          // best-effort: the snapshot is supplementary, so an unreachable cluster must not fail diagnostics
          logger.warn(`Failed to collect cluster resource snapshot: ${(error as Error).message}`);
        }

        logger.showUser(`  Resource snapshot written to ${snapshotDirectory}`);
      },
    };
  }

  /**
   * Renders the per-pod table sorted by CPU usage (highest first); pods without metrics sort last.
   */
  public static buildUsageReport(rows: PodResourceRow[]): string {
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted is outside the ES2022 lib target
    const sortedRows: PodResourceRow[] = [...rows].sort(
      (left: PodResourceRow, right: PodResourceRow): number =>
        (right.cpuInMillicores ?? -1) - (left.cpuInMillicores ?? -1),
    );

    const lines: string[] = ['CONTEXT\tNAMESPACE\tPOD\tPHASE\tCPU(m)\tMEMORY(Mi)\tRESTARTS\tCONTAINER STATE NOTES'];
    for (const row of sortedRows) {
      lines.push(
        [
          row.context,
          row.namespace,
          row.podName,
          row.phase,
          row.cpuInMillicores ?? 'n/a',
          row.memoryInMebibytes ?? 'n/a',
          row.restartCount,
          row.stateNotes.join('; ') || '-',
        ].join('\t'),
      );
    }
    return `${lines.join('\n')}\n`;
  }

  /**
   * Whether the pod shows evidence worth a full describe (restarts or an abnormal container state).
   */
  public static isSuspect(row: PodResourceRow): boolean {
    return row.restartCount > 0 || row.stateNotes.length > 0;
  }

  /**
   * Parses `docker exec <node> date +%s` output and returns how far the VM clock is ahead of (positive)
   * or behind (negative) the host clock, in seconds. Returns undefined when the output is not an epoch.
   */
  public static computeClockDriftSeconds(
    vmOutput: string,
    hostBeforeMilliseconds: number,
    hostAfterMilliseconds: number,
  ): number | undefined {
    const vmSeconds: number = Number.parseInt(vmOutput.trim(), 10);
    if (Number.isNaN(vmSeconds)) {
      return undefined;
    }
    // compare against the midpoint of the host clock around the exec to cancel out the call latency
    const hostSeconds: number = (hostBeforeMilliseconds + hostAfterMilliseconds) / 2 / 1000;
    return Math.round(vmSeconds - hostSeconds);
  }

  /**
   * Builds a short terminal summary (Docker CPU/memory/disk, VM clock drift and the top CPU pods) from a
   * previously written snapshot directory. Returns an empty list when there is no snapshot to summarize.
   */
  public static summarize(snapshotDirectory: string): string[] {
    if (!fs.existsSync(snapshotDirectory)) {
      return [];
    }

    const lines: string[] = [
      ...ResourceSnapshotCollector.summarizeDockerStats(PathEx.join(snapshotDirectory, 'docker-stats.txt')),
      ...ResourceSnapshotCollector.summarizeDockerDisk(PathEx.join(snapshotDirectory, 'docker-system-df.txt')),
      ...ResourceSnapshotCollector.summarizeClockDrift(PathEx.join(snapshotDirectory, 'docker-vm-clock-drift.txt')),
    ];

    const usageFiles: string[] = fs
      .readdirSync(snapshotDirectory)
      .filter((name: string): boolean => name.startsWith('pod-resource-usage-') && name.endsWith('.txt'));
    for (const usageFile of usageFiles) {
      lines.push(...ResourceSnapshotCollector.summarizePodUsage(PathEx.join(snapshotDirectory, usageFile)));
    }

    if (lines.length === 0) {
      return [];
    }
    return ['Resource usage snapshot:', ...lines.map((line: string): string => `  ${line}`)];
  }

  private static readLines(file: string): string[] {
    if (!fs.existsSync(file)) {
      return [];
    }
    return ResourceSnapshotCollector.mergeWrappedLines(fs.readFileSync(file, 'utf8').split('\n')).filter(
      (line: string): boolean => line.trim().length > 0 && !line.startsWith('#'),
    );
  }

  /**
   * ShellRunner splits each stdout chunk on newlines, so a table row that a command writes in two
   * pieces (seen with `docker system df`) comes back as two lines. Table rows always start in the first
   * column while a fragment starts with column padding, so appending it to the previous line restores the row.
   */
  public static mergeWrappedLines(lines: string[]): string[] {
    const merged: string[] = [];
    for (const line of lines) {
      if (merged.length > 0 && /^\s+\S/.test(line)) {
        merged[merged.length - 1] += line;
      } else {
        merged.push(line);
      }
    }
    return merged;
  }

  private static summarizeDockerStats(file: string): string[] {
    // columns: NAME, CPU %, MEM USAGE / LIMIT, MEM %, NET I/O, BLOCK I/O, PIDS (header first)
    return ResourceSnapshotCollector.readLines(file)
      .slice(1)
      .map((line: string): string => {
        const [name, cpu, memory, memoryPercent]: string[] = line.split(/\s{2,}/);
        const text: string = `Docker ${name}: CPU ${cpu}, memory ${memory} (${memoryPercent})`;
        const exceeded: boolean =
          Number.parseFloat(cpu) >= ResourceSnapshotCollector.DOCKER_CPU_WARNING_PERCENT ||
          Number.parseFloat(memoryPercent) >= ResourceSnapshotCollector.DOCKER_MEMORY_WARNING_PERCENT;
        return exceeded ? chalk.yellow(`⚠ ${text}`) : text;
      });
  }

  private static summarizeDockerDisk(file: string): string[] {
    // columns: TYPE, TOTAL, ACTIVE, SIZE, RECLAIMABLE (header first)
    const sizes: string[] = ResourceSnapshotCollector.readLines(file)
      .slice(1)
      .map((line: string): string => {
        const columns: string[] = line.split(/\s{2,}/);
        return `${columns[0]} ${columns[3]}`;
      });
    return sizes.length > 0 ? [`Docker disk: ${sizes.join(', ')}`] : [];
  }

  private static summarizeClockDrift(file: string): string[] {
    return ResourceSnapshotCollector.readLines(file).map((line: string): string => {
      const [name, drift]: string[] = line.split('\t');
      const seconds: number = Number.parseInt(drift?.split('=', 2)[1] ?? '', 10);
      if (Number.isNaN(seconds)) {
        return `VM clock drift on ${name}: unknown`;
      }
      const text: string = `VM clock drift on ${name}: ${seconds}s`;
      return Math.abs(seconds) >= ResourceSnapshotCollector.CLOCK_DRIFT_WARNING_SECONDS
        ? chalk.yellow(`⚠ ${text}`)
        : text;
    });
  }

  private static summarizePodUsage(file: string): string[] {
    // columns: CONTEXT, NAMESPACE, POD, PHASE, CPU(m), MEMORY(Mi), RESTARTS, NOTES (header first, CPU-sorted)
    const rows: string[][] = ResourceSnapshotCollector.readLines(file)
      .slice(1)
      .map((line: string): string[] => line.split('\t'));
    const lines: string[] = rows
      .slice(0, ResourceSnapshotCollector.SUMMARY_TOP_POD_COUNT)
      .map((row: string[]): string => `Top pod ${row[1]}/${row[2]}: CPU ${row[4]}m, memory ${row[5]}Mi`);

    const restarting: number = rows.filter((row: string[]): boolean => Number.parseInt(row[6], 10) > 0).length;
    if (restarting > 0) {
      lines.push(chalk.yellow(`⚠ ${restarting} pod(s) restarted, see ${file}`));
    }
    return lines;
  }

  private static async collectDockerHost(logger: SoloLogger, snapshotDirectory: string): Promise<void> {
    const runner: ShellRunner = new ShellRunner(logger);

    await ResourceSnapshotCollector.writeCommandOutput(
      runner,
      logger,
      PathEx.join(snapshotDirectory, 'docker-stats.txt'),
      constants.DOCKER,
      [
        'stats',
        '--no-stream',
        '--format',
        'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}',
      ],
    );
    await ResourceSnapshotCollector.writeCommandOutput(
      runner,
      logger,
      PathEx.join(snapshotDirectory, 'docker-system-df.txt'),
      constants.DOCKER,
      ['system', 'df'],
    );
    await ResourceSnapshotCollector.collectClockDrift(runner, logger, snapshotDirectory);
  }

  private static async collectClockDrift(
    runner: ShellRunner,
    logger: SoloLogger,
    snapshotDirectory: string,
  ): Promise<void> {
    const lines: string[] = [];
    try {
      const psOutput: string[] = await runner.run(
        constants.DOCKER,
        ['ps', '--filter', `label=${ResourceSnapshotCollector.KIND_CLUSTER_LABEL}`, '--format', '{{.Names}}'],
        {timeoutMs: ResourceSnapshotCollector.DOCKER_COMMAND_TIMEOUT_MS, bestEffort: true},
      );
      const nodeNames: string[] = psOutput.filter((name: string): boolean => name.trim().length > 0);

      for (const nodeName of nodeNames) {
        const hostBefore: number = Date.now();
        const output: string[] = await runner.run(constants.DOCKER, ['exec', nodeName, 'date', '+%s'], {
          timeoutMs: ResourceSnapshotCollector.DOCKER_COMMAND_TIMEOUT_MS,
          bestEffort: true,
        });
        const drift: number | undefined = ResourceSnapshotCollector.computeClockDriftSeconds(
          output.join('\n'),
          hostBefore,
          Date.now(),
        );
        lines.push(`${nodeName}\tvm-clock-minus-host-seconds=${drift ?? 'unknown'}`);
      }
      if (lines.length === 0) {
        lines.push('# no Kind node containers found');
      }
    } catch (error) {
      // best-effort: Docker may be absent (non-Kind cluster) or stopped
      logger.debug(`Could not measure Docker VM clock drift: ${(error as Error).message}`);
      lines.push(`# unavailable: ${(error as Error).message}`);
    }
    fs.writeFileSync(PathEx.join(snapshotDirectory, 'docker-vm-clock-drift.txt'), `${lines.join('\n')}\n`);
  }

  private static async writeCommandOutput(
    runner: ShellRunner,
    logger: SoloLogger,
    destination: string,
    command: string,
    commandArguments: string[],
  ): Promise<void> {
    let content: string;
    try {
      const output: string[] = await runner.run(command, commandArguments, {
        timeoutMs: ResourceSnapshotCollector.DOCKER_COMMAND_TIMEOUT_MS,
        bestEffort: true,
      });
      content = `${ResourceSnapshotCollector.mergeWrappedLines(output).join('\n')}\n`;
    } catch (error) {
      // best-effort: record why the data is missing instead of failing the diagnostics command
      logger.debug(`Could not run '${command} ${commandArguments.join(' ')}': ${(error as Error).message}`);
      content = `# unavailable: ${(error as Error).message}\n`;
    }
    fs.writeFileSync(destination, content);
  }

  private static async collectCluster(
    k8: K8,
    context: string,
    logger: SoloLogger,
    snapshotDirectory: string,
    scopedNamespace: NamespaceName | undefined,
    includePodSpecs: boolean,
  ): Promise<void> {
    const metricsByPod: Map<string, PodMetricsItem> = new Map<string, PodMetricsItem>();
    try {
      for (const item of await k8.pods().topPods(scopedNamespace)) {
        metricsByPod.set(`${item.namespace.name}/${item.podName.toString()}`, item);
      }
    } catch (error) {
      // best-effort: metrics-server is not installed in every cluster
      logger.debug(`Pod metrics unavailable in context ${context}: ${(error as Error).message}`);
    }

    const podList: Pod[] = scopedNamespace
      ? await k8.pods().list(scopedNamespace, [])
      : await k8.pods().listForAllNamespaces([]);

    const rows: PodResourceRow[] = [];
    for (const listedPod of podList) {
      try {
        // listForAllNamespaces returns bare references; read each pod to get its container statuses
        const pod: Pod = await k8.pods().read(listedPod.podReference);
        const metrics: PodMetricsItem | undefined = metricsByPod.get(
          `${pod.podReference.namespace.name}/${pod.podReference.name.toString()}`,
        );
        rows.push(ResourceSnapshotCollector.toRow(context, pod, metrics));
      } catch (error) {
        // best-effort: a pod can disappear between list and read
        logger.debug(`Skipping pod ${listedPod.podReference?.name} in context ${context}: ${(error as Error).message}`);
      }
    }

    fs.writeFileSync(
      PathEx.join(snapshotDirectory, `pod-resource-usage-${context}.txt`),
      ResourceSnapshotCollector.buildUsageReport(rows),
    );

    if (includePodSpecs) {
      // pod specs embed env var values, so they are omitted when sensitive data is excluded
      await ResourceSnapshotCollector.describeSuspectPods(k8, context, logger, snapshotDirectory, rows);
    }
  }

  private static toRow(context: string, pod: Pod, metrics: PodMetricsItem | undefined): PodResourceRow {
    const statuses: ContainerStatus[] = pod.allContainerStatuses ?? [];
    const stateNotes: string[] = [];
    for (const status of statuses) {
      if (status.waitingReason) {
        stateNotes.push(`${status.name}: waiting ${status.waitingReason}`);
      }
      if (status.terminatedReason && !ResourceSnapshotCollector.isCleanCompletion(status)) {
        stateNotes.push(`${status.name}: ${status.terminatedReason} (exit ${status.terminatedExitCode ?? '?'})`);
      }
    }

    return {
      context,
      podReference: pod.podReference,
      namespace: pod.podReference.namespace.name,
      podName: pod.podReference.name.toString(),
      phase: pod.phase ?? 'Unknown',
      cpuInMillicores: metrics?.cpuInMillicores,
      memoryInMebibytes: metrics?.memoryInMebibytes,
      restartCount: statuses.reduce(
        (sum: number, status: ContainerStatus): number => sum + (status.restartCount ?? 0),
        0,
      ),
      stateNotes,
    };
  }

  /**
   * A container that exited normally (for example a finished init container) is not evidence of a problem.
   */
  private static isCleanCompletion(status: ContainerStatus): boolean {
    return status.terminatedReason === 'Completed' && (status.terminatedExitCode ?? 0) === 0;
  }

  /**
   * Writes a describe report (pod spec plus events) for the top CPU consumers and any pod that
   * restarted or sits in an abnormal state, capped to keep the bundle small.
   */
  private static async describeSuspectPods(
    k8: K8,
    context: string,
    logger: SoloLogger,
    snapshotDirectory: string,
    rows: PodResourceRow[],
  ): Promise<void> {
    const byCpu: PodResourceRow[] = [...rows]
      .filter((row: PodResourceRow): boolean => row.cpuInMillicores !== undefined)
      // eslint-disable-next-line unicorn/no-array-sort -- toSorted is outside the ES2022 lib target
      .sort((left: PodResourceRow, right: PodResourceRow): number => right.cpuInMillicores - left.cpuInMillicores)
      .slice(0, ResourceSnapshotCollector.TOP_CPU_POD_DESCRIBE_COUNT);
    const suspects: PodResourceRow[] = rows.filter((row: PodResourceRow): boolean =>
      ResourceSnapshotCollector.isSuspect(row),
    );
    const selected: PodResourceRow[] = [...new Set<PodResourceRow>([...byCpu, ...suspects])].slice(
      0,
      ResourceSnapshotCollector.MAX_DESCRIBED_PODS,
    );

    if (selected.length === 0) {
      return;
    }

    const describeDirectory: string = PathEx.join(snapshotDirectory, 'pod-describe', context);
    fs.mkdirSync(describeDirectory, {recursive: true});

    for (const row of selected) {
      try {
        const describe: string = await k8.pods().readDescribe(row.podReference);
        fs.writeFileSync(PathEx.join(describeDirectory, `${row.namespace}_${row.podName}.yaml`), describe);
      } catch (error) {
        // best-effort: skip pods that vanished or whose describe fails
        logger.debug(`Could not describe pod ${row.namespace}/${row.podName}: ${(error as Error).message}`);
      }
    }
  }
}
