// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type PodReference} from './pod-reference.js';
import {type Pod} from './pod.js';
import {type ContainerName} from '../container/container-name.js';
import {type PodMetricsItem} from './pod-metrics-item.js';

export interface Pods {
  /**
   * Get a pod by reference for running operations against.  You can use null if you only want to use stopPortForward()
   * @param podReference - the reference to the pod
   * @returns a pod object
   */
  readByReference(podReference: PodReference | null): Pod;

  /**
   * Get a pod by name
   * @returns Pod - pod object
   * @param podReference - the reference to the pod
   */
  read(podReference: PodReference): Promise<Pod>;

  /**
   * Get pods by labels
   * @param namespace - the namespace of the pod
   * @param labels - list of labels
   * @returns Pod[] - list of pod objects
   */
  list(namespace: NamespaceName, labels: string[]): Promise<Pod[]>;

  /**
   * Check if pod's ready status is true
   * @param namespace - namespace
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   */
  waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts?: number,
    delay?: number,
    createdAfter?: Date,
  ): Promise<Pod[]>;

  /**
   * Poll until a pod with the given reference appears in the Kubernetes API.
   *
   * Use this when you already know the exact pod name (e.g. a StatefulSet pod
   * like `postgres-0`) and need to guard a follow-up operation — such as
   * `copyTo`, `copyFrom`, or `execContainer` — against the brief window where
   * Kubernetes marks the pod Ready but the API object is not yet returned by
   * `read()`.  This transient "pod not found" gap is more pronounced on slower
   * GitHub-hosted runners than on local kind clusters.
   *
   * Contrast with {@link waitForStableReadyPod}, which resolves a pod by label
   * selector and additionally requires the result to be stable across
   * consecutive polls (suited for rolling deployments where the pod name can
   * change between restarts).
   *
   * @param podReference - exact reference of the pod to wait for
   * @param maxAttempts - maximum number of polling attempts (default 20)
   * @param delay - milliseconds to wait between attempts (default 3000)
   */
  waitForPodByReference(podReference: PodReference, maxAttempts?: number, delay?: number): Promise<void>;

  /**
   * Wait for the newest ready pod matching the labels to remain the newest ready pod
   * for a number of consecutive polls.
   *
   * Use this when you need a pod that has fully stabilised after a rolling
   * update — i.e. the pod name or creation-timestamp must stop changing across
   * several successive polls before the function returns.  This is stricter
   * than {@link waitForReadyStatus}, which returns as soon as any matching pod
   * reports Ready=True without verifying that the pod identity has settled.
   *
   * Typical callers: post-upgrade readiness checks, port-forward setup after
   * a restart, and any operation where acting on a pod that is mid-replacement
   * would be incorrect.
   *
   * @param namespace - namespace
   * @param labels - pod labels used to find the target pod
   * @param consecutiveStableChecks - number of consecutive polls that must see the same newest ready pod (default 3)
   * @param maxAttempts - maximum attempts to check (default 120)
   * @param delay - delay between checks in milliseconds (default 1000)
   */
  waitForStableReadyPod(
    namespace: NamespaceName,
    labels: string[],
    consecutiveStableChecks?: number,
    maxAttempts?: number,
    delay?: number,
  ): Promise<Pod>;

  /**
   * Check if pod's phase is running
   * @param namespace - namespace
   * @param labels - pod labels
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   * @param [podItemPredicate] - pod item predicate
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   */
  waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: Pod) => boolean,
    createdAfter?: Date,
  ): Promise<Pod[]>;

  /**
   * List all the pods across all namespaces with the given labels
   * @param labels - list of labels
   * @returns list of pods
   */
  listForAllNamespaces(labels: string[]): Promise<Pod[]>;

  /**
   * Create a pod
   * @param podReference - the reference to the pod
   * @param labels - list of label records where the key is the label name and the value is the label value
   * @param containerName - the name of the container
   * @param containerImage - the image of the container
   * @param containerCommand - the command to run in the container
   * @param startupProbeCommand - the command to run in the startup probe
   * @returns the pod that was created
   */
  create(
    podReference: PodReference,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod>;

  /**
   * Delete a pod by reference
   * @param podReference - the reference to the pod
   */
  delete(podReference: PodReference): Promise<void>;

  /**
   * Read logs for the given pod across all containers.
   * @param podReference - the reference to the pod
   * @param timestamps - include timestamps in output
   * @returns logs as a single string
   */
  readLogs(podReference: PodReference, timestamps?: boolean): Promise<string>;

  /**
   * Build a describe-like textual report for a pod, including pod details and related events.
   * @param podReference - the reference to the pod
   * @returns describe-like output string
   */
  readDescribe(podReference: PodReference): Promise<string>;

  /**
   * Delete a pod by reference
   * @param podReference - the reference to the pod
   */
  delete(podReference: PodReference): Promise<void>;

  /**
   * Get CPU and memory usage for pods via the Kubernetes Metrics API (equivalent to `kubectl top pod`)
   * @param namespace - if provided, only get metrics for pods in this namespace; otherwise get metrics for all namespaces
   * @param labelSelector - if provided, only get metrics for pods matching this label selector
   * @returns list of pod metrics items with CPU (in millicores) and memory (in mebibytes)
   */
  topPods(namespace?: NamespaceName, labelSelector?: string): Promise<PodMetricsItem[]>;

  /**
   * Read logs for the given pod across all containers.
   * @param podReference - the reference to the pod
   * @param timestamps - include timestamps in output
   * @returns logs as a single string
   */
  readLogs(podReference: PodReference, timestamps?: boolean): Promise<string>;

  /**
   * Build a describe-like textual report for a pod, including pod details and related events.
   * @param podReference - the reference to the pod
   * @returns describe-like output string
   */
  readDescribe(podReference: PodReference): Promise<string>;
}
