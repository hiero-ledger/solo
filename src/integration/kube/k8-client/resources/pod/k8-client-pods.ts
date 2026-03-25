// SPDX-License-Identifier: Apache-2.0

import {
  type CoreV1Event,
  type CoreV1Api,
  type KubeConfig,
  Metrics,
  type PodMetricsList,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Pod,
  type V1PodList,
  V1PodSpec,
  V1Probe,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {PodReference} from '../../../resources/pod/pod-reference.js';
import {type Pod} from '../../../resources/pod/pod.js';
import {K8ClientPod} from './k8-client-pod.js';
import {Duration} from '../../../../../core/time/duration.js';
import {K8ClientBase} from '../../k8-client-base.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {MissingArgumentError} from '../../../../../core/errors/missing-argument-error.js';
import * as constants from '../../../../../core/constants.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {type ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {type PodMetricsItem} from '../../../resources/pod/pod-metrics-item.js';
import yaml from 'yaml';
import {sleep} from '../../../../../core/helpers.js';

export class K8ClientPods extends K8ClientBase implements Pods {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
    private readonly kubectlInstallationDirectory: string,
  ) {
    super();
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public readByReference(podReference: PodReference | null): Pod {
    return new K8ClientPod(podReference, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory);
  }

  public async read(podReference: PodReference): Promise<Pod> {
    const ns: NamespaceName = podReference.namespace;
    const fieldSelector: string = `metadata.name=${podReference.name}`;

    const resp: V1PodList = await this.kubeClient.listNamespacedPod({
      namespace: ns.name,
      fieldSelector,
      timeoutSeconds: Duration.ofMinutes(5).toMillis(),
    });

    return K8ClientPod.fromV1Pod(
      this.filterItem(resp.items, {name: podReference.name.toString()}),
      this,
      this.kubeClient,
      this.kubeConfig,
      this.kubectlInstallationDirectory,
    );
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

    const result: V1PodList = await this.kubeClient.listNamespacedPod({
      namespace: namespace.name,
      labelSelector,
      timeoutSeconds: Duration.ofMinutes(5).toMillis(),
    });

    const sortedItems: V1Pod[] = result?.items
      ? // eslint-disable-next-line unicorn/no-array-sort
        [...result.items].sort(
          (a, b): number =>
            new Date(b.metadata?.creationTimestamp || 0).getTime() -
            new Date(a.metadata?.creationTimestamp || 0).getTime(),
        )
      : [];

    return sortedItems.map(
      (item: V1Pod): Pod =>
        K8ClientPod.fromV1Pod(item, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory),
    );
  }

  public async waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number = 10,
    delay: number = 500,
    createdAfter?: Date,
  ): Promise<Pod[]> {
    const podReadyCondition: Map<string, string> = new Map<string, string>().set(
      constants.POD_CONDITION_READY,
      constants.POD_CONDITION_STATUS_TRUE,
    );

    try {
      return await this.waitForPodConditions(namespace, podReadyCondition, labels, maxAttempts, delay, createdAfter);
    } catch (error: Error | unknown) {
      throw new SoloError(`Pod not ready [maxAttempts = ${maxAttempts}]`, error);
    }
  }

  /**
   * Poll until the pod identified by `podReference` is returned by the Kubernetes API.
   *
   * This guards container operations (copyTo / copyFrom / execContainer) against the
   * brief window where Kubernetes has marked a pod Ready but `pods.read()` still returns
   * null — a race that is more common on slower GitHub-hosted runners than on local
   * kind clusters.
   *
   * Use this when the exact pod name is already known (e.g. a StatefulSet replica such
   * as `postgres-0`).  If the pod name is unknown and must be resolved by label selector,
   * use {@link waitForStableReadyPod} instead.
   *
   * @param podReference - exact reference of the pod to wait for
   * @param maxAttempts - maximum polling attempts before throwing (default 20 × 3 s = 60 s)
   * @param delay - milliseconds between attempts (default 3000)
   */
  public async waitForPodByReference(
    podReference: PodReference,
    maxAttempts: number = 20,
    delay: number = 3000,
  ): Promise<void> {
    const podName: string = podReference.name.toString();
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const pod: Pod = await this.read(podReference);
      if (pod) {
        return;
      }
      this.logger.debug(
        `waitForPodByReference: pod ${podName} not yet visible in API, attempt ${attempt}/${maxAttempts}`,
      );
      await sleep(Duration.ofMillis(delay));
    }
    throw new SoloError(`Pod ${podName} not found after ${maxAttempts} attempts`);
  }

  /**
   * Wait for a ready pod to become stable enough for follow-up operations such as exec or port-forward.
   *
   * Use this when the pod name is not fixed — e.g. after a rolling update the pod
   * may have a new name or creation timestamp.  The method polls until the same newest
   * ready pod (identified by name + creation timestamp) is observed for
   * `consecutiveStableChecks` polls in a row, ensuring the replacement has fully settled
   * before the caller proceeds.
   *
   * This is stricter than {@link waitForReadyStatus}, which returns as soon as any
   * matching pod reports Ready=True without verifying that the pod identity has settled.
   *
   * Use {@link waitForPodByReference} instead when the exact pod name is already known
   * and you only need to confirm it has appeared in the API (no stability check needed).
   *
   * @param namespace - namespace containing the target pod(s)
   * @param labels - labels used to select the target pod(s)
   * @param [consecutiveStableChecks] - consecutive checks that must see the same newest ready pod (default 3)
   * @param [maxAttempts] - maximum polling attempts (default 120)
   * @param [delay] - delay between poll attempts in milliseconds (default 1000)
   * @returns the newest stable ready pod
   */
  public async waitForStableReadyPod(
    namespace: NamespaceName,
    labels: string[],
    consecutiveStableChecks: number = 3,
    maxAttempts: number = 120,
    delay: number = 1000,
  ): Promise<Pod> {
    const startTime: number = Date.now();
    let previousPodIdentity: string = '';
    let stableChecks: number = 0;
    let latestPod: Pod | undefined;

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        latestPod = await this.getSingleNewestStableReadyPod(namespace, labels);
        const podIdentity: string =
          `${latestPod.podReference?.name.toString() || '<unknown>'}:` +
          `${latestPod.creationTimestamp?.getTime() || 0}`;

        if (podIdentity === previousPodIdentity) {
          stableChecks++;
        } else {
          previousPodIdentity = podIdentity;
          stableChecks = 1;
        }

        if (stableChecks >= consecutiveStableChecks) {
          const elapsedMs: number = Date.now() - startTime;
          this.logger.info(
            `Stable ready pod ${latestPod.podReference?.name.toString() || '<unknown>'} ` +
              `confirmed in ${elapsedMs} ms [namespace=${namespace.name}, labels=${labels.join(',')}]`,
          );
          return latestPod;
        }
      } catch {
        previousPodIdentity = '';
        stableChecks = 0;
      }

      await sleep(Duration.ofMillis(delay));
    }

    throw new SoloError(
      `Failed to observe a stable ready pod after ${maxAttempts} attempts ` +
        `[namespace=${namespace.name}, labels=${labels.join(',')}]`,
    );
  }

  /**
   * Check pods for conditions
   * @param namespace - namespace
   * @param conditionsMap - a map of conditions and values
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   */
  private async waitForPodConditions(
    namespace: NamespaceName,
    conditionsMap: Map<string, string>,
    labels: string[] = [],
    maxAttempts: number = 10,
    delay: number = 500,
    createdAfter?: Date,
  ): Promise<Pod[]> {
    if (!conditionsMap || conditionsMap.size === 0) {
      throw new MissingArgumentError('pod conditions are required');
    }

    return await this.waitForRunningPhase(
      namespace,
      labels,
      maxAttempts,
      delay,
      (pod): boolean => {
        if (pod.conditions?.length > 0) {
          for (const cond of pod.conditions) {
            for (const entry of conditionsMap.entries()) {
              const condType: string = entry[0];
              const condStatus: string = entry[1];
              if (cond.type === condType && cond.status === condStatus) {
                this.logger.info(
                  `Pod condition met for ${pod.podReference.name.name} [type: ${cond.type} status: ${cond.status}]`,
                );
                return true;
              }
            }
          }
        }
        // condition not found
        return false;
      },
      createdAfter,
    );
  }

  private async getSingleNewestStableReadyPod(namespace: NamespaceName, labels: string[]): Promise<Pod> {
    const pods: Pod[] = await this.list(namespace, labels).then((matchingPods: Pod[]): Pod[] =>
      matchingPods.filter(
        (pod: Pod): boolean => !pod.deletionTimestamp && !!pod.podReference && !!pod.podIp && this.isPodReady(pod),
      ),
    );

    if (pods.length === 0) {
      throw new SoloError(`Expected at least one stable ready pod with labels: ${labels.join(',')}`);
    }

    const newestCreationTime: number = pods[0].creationTimestamp?.getTime() || 0;
    const newestPods: Pod[] = pods.filter(
      (pod: Pod): boolean => (pod.creationTimestamp?.getTime() || 0) === newestCreationTime,
    );

    if (newestPods.length !== 1) {
      throw new SoloError(
        `Expected exactly one newest stable pod, found ${newestPods.length} with labels: ${labels.join(',')}`,
      );
    }

    return newestPods[0];
  }

  private isPodReady(pod: Pod): boolean {
    return (
      pod.conditions?.some(
        (condition): boolean =>
          condition.type === constants.POD_CONDITION_READY && condition.status === constants.POD_CONDITION_STATUS_TRUE,
      ) ?? false
    );
  }

  public async waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: Pod) => boolean,
    createdAfter?: Date,
  ): Promise<Pod[]> {
    const phases: string[] = [constants.POD_PHASE_RUNNING];
    const labelSelector: string = labels ? labels.join(',') : undefined;

    this.logger.info(
      `waitForRunningPhase [labelSelector: ${labelSelector}, namespace:${namespace.name}, maxAttempts: ${maxAttempts}]`,
    );

    return new Promise<Pod[]>((resolve, reject): void => {
      let attempts: number = 0;

      const check: (resolve: (items: Pod[]) => void, reject: (reason?: Error) => void) => Promise<void> = async (
        resolve: (items: Pod[]) => void,
        reject: (reason?: Error) => void,
      ): Promise<void> => {
        // wait for the pod to be available with the given status and labels
        try {
          const response: V1PodList = await this.kubeClient.listNamespacedPod({
            namespace: namespace.name,
            labelSelector,
            timeoutSeconds: Duration.ofMinutes(5).toMillis(),
          });

          this.logger.debug(
            `[attempt: ${attempts}/${maxAttempts}] ${response.items?.length} pod(s) found [labelSelector: ${labelSelector}, namespace:${namespace.name}]`,
          );

          if (response.items?.length > 0) {
            // Sort pods by creation timestamp descending (newest first)
            // eslint-disable-next-line unicorn/no-array-sort
            const sortedItems: V1Pod[] = [...response.items].sort((a, b): number => {
              const aTime: number = a.metadata?.creationTimestamp?.getTime() || 0;
              const bTime: number = b.metadata?.creationTimestamp?.getTime() || 0;
              return bTime - aTime;
            });

            // When a createdAfter cutoff is provided, skip pods that existed before the
            // cutoff (e.g. a terminating predecessor from a recreate migration).
            const eligibleItems: V1Pod[] = createdAfter
              ? sortedItems.filter(
                  (p): boolean => (p.metadata?.creationTimestamp?.getTime() || 0) > createdAfter.getTime(),
                )
              : sortedItems;

            if (eligibleItems.length > 0) {
              // Only check the newest eligible pod
              const newestItem: V1Pod = eligibleItems[0];
              const pod: Pod = K8ClientPod.fromV1Pod(
                newestItem,
                this,
                this.kubeClient,
                this.kubeConfig,
                this.kubectlInstallationDirectory,
              );
              if (phases.includes(newestItem.status?.phase) && (!podItemPredicate || podItemPredicate(pod))) {
                return resolve([pod]);
              }
            }
          }
        } catch (error) {
          this.logger.info('Error occurred while waiting for pods, retrying', error);
        }

        if (++attempts < maxAttempts) {
          setTimeout((): Promise<void> => check(resolve, reject), delay);
        } else {
          return reject(
            new SoloError(
              `Expected at least 1 pod not found for labels: ${labelSelector}, phases: ${phases.join(',')} [attempts = ${attempts}/${maxAttempts}]`,
            ),
          );
        }
      };

      check(resolve, reject);
    });
  }

  public async listForAllNamespaces(labels: string[]): Promise<Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const pods: Pod[] = [];

    try {
      const response: V1PodList = await this.kubeClient.listPodForAllNamespaces({labelSelector});

      if (response?.items?.length > 0) {
        for (const item of response.items) {
          pods.push(
            new K8ClientPod(
              PodReference.of(NamespaceName.of(item.metadata?.namespace), PodName.of(item.metadata?.name)),
              this,
              this.kubeClient,
              this.kubeConfig,
              this.kubectlInstallationDirectory,
            ),
          );
        }
      }
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.POD, undefined, '');
    }

    return pods;
  }

  public async create(
    podReference: PodReference,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod> {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = podReference.name.toString();
    v1Metadata.namespace = podReference.namespace.toString();
    v1Metadata.labels = labels;

    const v1ExecAction: V1ExecAction = new V1ExecAction();
    v1ExecAction.command = startupProbeCommand;

    const v1Probe: V1Probe = new V1Probe();
    v1Probe.exec = v1ExecAction;

    const v1Container: V1Container = new V1Container();
    v1Container.name = containerName.name;
    v1Container.image = containerImage;
    v1Container.command = containerCommand;
    v1Container.startupProbe = v1Probe;

    const v1Spec: V1PodSpec = new V1PodSpec();
    v1Spec.containers = [v1Container];

    const v1Pod: V1Pod = new V1Pod();
    v1Pod.metadata = v1Metadata;
    v1Pod.spec = v1Spec;

    let result: V1Pod;
    try {
      result = await this.kubeClient.createNamespacedPod({namespace: podReference.namespace.toString(), body: v1Pod});
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      KubeApiResponse.throwError(
        error,
        ResourceOperation.CREATE,
        ResourceType.POD,
        podReference.namespace,
        podReference.name.toString(),
      );
    }

    if (result) {
      return new K8ClientPod(podReference, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory);
    } else {
      throw new SoloError('Error creating pod', result);
    }
  }

  public async delete(podReference: PodReference): Promise<void> {
    try {
      await this.kubeClient.deleteNamespacedPod({
        namespace: podReference.namespace.toString(),
        name: podReference.name.toString(),
      });
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.DELETE,
        ResourceType.POD,
        podReference.namespace,
        podReference.name.toString(),
      );
    }
  }

  public async readLogs(podReference: PodReference, timestamps: boolean = true): Promise<string> {
    const namespace: string = podReference.namespace.toString();
    const name: string = podReference.name.toString();
    const pod: V1Pod = await this.kubeClient.readNamespacedPod({name, namespace});
    const containerNames: string[] = [
      ...(pod.spec?.initContainers?.map((container: V1Container): string => container.name) ?? []),
      ...(pod.spec?.containers?.map((container: V1Container): string => container.name) ?? []),
      ...(pod.spec?.ephemeralContainers?.map((container: V1Container): string => container.name) ?? []),
    ].filter(Boolean);

    if (containerNames.length === 0) {
      const log: string = await this.kubeClient.readNamespacedPodLog({
        name,
        namespace,
        timestamps,
      });
      return log ?? '';
    }

    const containerLogs: string[] = [];
    for (const containerName of containerNames) {
      try {
        const containerLog: string = await this.kubeClient.readNamespacedPodLog({
          name,
          namespace,
          container: containerName,
          timestamps,
        });
        containerLogs.push(`===== Container: ${containerName} =====\n${containerLog ?? ''}`.trimEnd());
      } catch (error) {
        containerLogs.push(
          `===== Container: ${containerName} =====\nFailed to read logs: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return containerLogs.join('\n\n');
  }

  public async readDescribe(podReference: PodReference): Promise<string> {
    const namespace: string = podReference.namespace.toString();
    const name: string = podReference.name.toString();
    const pod: V1Pod = await this.kubeClient.readNamespacedPod({name, namespace});
    const events: {items?: CoreV1Event[]} = await this.kubeClient.listNamespacedEvent({
      namespace,
      fieldSelector: `involvedObject.name=${name},involvedObject.namespace=${namespace}`,
    });

    // eslint-disable-next-line unicorn/no-array-sort
    const sortedEvents: CoreV1Event[] = [...(events?.items ?? [])].sort((left, right): number => {
      const leftTime: number = new Date(
        left.lastTimestamp ?? left.eventTime ?? left.firstTimestamp ?? left.metadata?.creationTimestamp ?? 0,
      ).getTime();
      const rightTime: number = new Date(
        right.lastTimestamp ?? right.eventTime ?? right.firstTimestamp ?? right.metadata?.creationTimestamp ?? 0,
      ).getTime();
      return leftTime - rightTime;
    });

    const describeData: {pod: V1Pod; events: typeof sortedEvents} = {
      pod,
      events: sortedEvents,
    };

    return yaml.stringify(describeData);
  }

  public async topPods(namespace?: NamespaceName, labelSelector?: string): Promise<PodMetricsItem[]> {
    const metrics: Metrics = new Metrics(this.kubeConfig);
    const podMetricsList: PodMetricsList = await metrics.getPodMetrics(namespace?.name);

    let allowedPodKeys: Set<string> | undefined;
    if (labelSelector) {
      const podList: V1PodList = namespace
        ? await this.kubeClient.listNamespacedPod({
            namespace: namespace.name,
            labelSelector,
            timeoutSeconds: Duration.ofMinutes(5).toMillis(),
          })
        : await this.kubeClient.listPodForAllNamespaces({labelSelector});
      allowedPodKeys = new Set(
        podList.items.map((p): string => `${p.metadata?.namespace ?? ''}/${p.metadata?.name ?? ''}`),
      );
    }

    return podMetricsList.items
      .filter((podMetric): boolean => {
        if (!allowedPodKeys) {
          return true;
        }
        return allowedPodKeys.has(`${podMetric.metadata.namespace}/${podMetric.metadata.name}`);
      })
      .map((podMetric): PodMetricsItem => {
        let cpuInMillicores: number = 0;
        let memoryInMebibytes: number = 0;
        for (const c of podMetric.containers) {
          cpuInMillicores += K8ClientPods.parseMillicores(c.usage.cpu);
          memoryInMebibytes += K8ClientPods.parseMebibytes(c.usage.memory);
        }
        return {
          namespace: NamespaceName.of(podMetric.metadata.namespace),
          podName: PodName.of(podMetric.metadata.name),
          cpuInMillicores,
          memoryInMebibytes,
        };
      });
  }

  /**
   * Parse a Kubernetes CPU quantity string into millicores.
   * Examples: "100m" -> 100, "1" -> 1000, "0.5" -> 500, "100000n" -> 0 (rounded)
   */
  private static parseMillicores(quantity: string): number {
    if (!quantity) {
      return 0;
    }
    if (quantity.endsWith('n')) {
      return Math.round(Number.parseInt(quantity.slice(0, -1), 10) / 1_000_000);
    }
    if (quantity.endsWith('u')) {
      return Math.round(Number.parseInt(quantity.slice(0, -1), 10) / 1000);
    }
    if (quantity.endsWith('m')) {
      return Number.parseInt(quantity.slice(0, -1), 10);
    }
    return Math.round(Number.parseFloat(quantity) * 1000);
  }

  /**
   * Parse a Kubernetes memory quantity string into mebibytes (MiB).
   * Examples: "50Mi" -> 50, "1Gi" -> 1024, "52428800" -> 50, "512Ki" -> 0 (rounded)
   */
  private static parseMebibytes(quantity: string): number {
    if (!quantity) {
      return 0;
    }
    if (quantity.endsWith('Ki')) {
      return Math.round(Number.parseInt(quantity.slice(0, -2), 10) / 1024);
    }
    if (quantity.endsWith('Mi')) {
      return Number.parseInt(quantity.slice(0, -2), 10);
    }
    if (quantity.endsWith('Gi')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024;
    }
    if (quantity.endsWith('Ti')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024 * 1024;
    }
    if (quantity.endsWith('Pi')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024 * 1024 * 1024;
    }
    if (quantity.endsWith('k')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1000) / (1024 * 1024));
    }
    if (quantity.endsWith('M')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1_000_000) / (1024 * 1024));
    }
    if (quantity.endsWith('G')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1_000_000_000) / (1024 * 1024));
    }
    // Plain number (bytes)
    return Math.round(Number.parseFloat(quantity) / (1024 * 1024));
  }
}
