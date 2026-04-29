// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {execFileSync} from 'node:child_process';
import {container} from 'tsyringe-neo';

import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {Duration} from '../../../../src/core/time/duration.js';
import * as constants from '../../../../src/core/constants.js';

import {type K8ClientFactory} from '../../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {type Containers} from '../../../../src/integration/kube/resources/container/containers.js';
import {type Container} from '../../../../src/integration/kube/resources/container/container.js';
import {ROOT_CONTAINER} from '../../../../src/core/constants.js';
import {type BaseTestOptions} from '../../commands/tests/base-test-options.js';

type TcpRouteItem = {
  metadata?: {
    name?: string;
  };
  status?: {
    parents?: Array<{
      conditions?: Array<{
        type?: string;
        status?: string;
      }>;
    }>;
  };
};

type TcpRouteList = {
  items?: Array<TcpRouteItem>;
};

export class SoloDeploymentChartValidationTest {
  private static readonly SIDECAR_NAMES: readonly string[] = [
    'record-stream-uploader',
    'event-stream-uploader',
    'backup-uploader',
    'otel-collector',
  ];

  private static getK8(options: BaseTestOptions): K8 {
    const context: string = options.contexts[0];
    return container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(context);
  }

  private static kubectlJson<T>(options: BaseTestOptions, deploymentNamespace: string, arguments_: string[]): T {
    const k8: K8 = this.getK8(options);
    const context: string = options.contexts[0];
    const kubectl: string = k8.getKubectlExecutablePath();

    const output: string = execFileSync(kubectl, ['--context', context, '-n', deploymentNamespace, ...arguments_], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return JSON.parse(output) as T;
  }

  private static kubectlJsonPath(
    options: BaseTestOptions,
    deploymentNamespace: string,
    podName: string,
    jsonPath: string,
  ): string {
    const k8: K8 = this.getK8(options);
    const context: string = options.contexts[0];
    const kubectl: string = k8.getKubectlExecutablePath();

    return execFileSync(
      kubectl,
      ['--context', context, '-n', deploymentNamespace, 'get', 'pod', podName, '-o', `jsonpath=${jsonPath}`],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  }

  public static validate(options: BaseTestOptions, deploymentNamespace: string): void {
    const {testName, testLogger} = options;
    const namespace: NamespaceName = NamespaceName.of(deploymentNamespace);

    it(`${testName}: network-node pods are running and ready`, async (): Promise<void> => {
      testLogger.info(`${testName}: validating network-node pods`);

      const k8: K8 = this.getK8(options);

      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          ['solo.hedera.com/type=network-node'],
          constants.PODS_RUNNING_MAX_ATTEMPTS,
          constants.PODS_RUNNING_DELAY,
        );

      await k8
        .pods()
        .waitForReadyStatus(
          namespace,
          ['solo.hedera.com/type=network-node'],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods.length, 'expected at least one network-node pod').to.be.greaterThan(0);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: haproxy and envoy proxy pods are running and ready`, async (): Promise<void> => {
      testLogger.info(`${testName}: validating haproxy/envoy proxy pods`);

      const k8: K8 = this.getK8(options);

      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          ['solo.hedera.com/type=haproxy'],
          constants.PODS_RUNNING_MAX_ATTEMPTS,
          constants.PODS_RUNNING_DELAY,
        );

      await k8
        .pods()
        .waitForReadyStatus(
          namespace,
          ['solo.hedera.com/type=haproxy'],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          ['solo.hedera.com/type=envoy-proxy'],
          constants.PODS_RUNNING_MAX_ATTEMPTS,
          constants.PODS_RUNNING_DELAY,
        );

      await k8
        .pods()
        .waitForReadyStatus(
          namespace,
          ['solo.hedera.com/type=envoy-proxy'],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      const haproxyPods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=haproxy']);
      const envoyPods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=envoy-proxy']);

      expect(haproxyPods.length, 'expected at least one haproxy pod').to.be.greaterThan(0);
      expect(envoyPods.length, 'expected at least one envoy pod').to.be.greaterThan(0);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: root-container init system is running`, async (): Promise<void> => {
      testLogger.info(`${testName}: validating root-container init system`);

      const k8: K8 = this.getK8(options);
      const k8Containers: Containers = k8.containers();

      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods.length, 'expected at least one network-node pod').to.be.greaterThan(0);

      for (const pod of pods) {
        const containerReference: ContainerReference = ContainerReference.of(pod.podReference, ROOT_CONTAINER);
        const rootContainer: Container = k8Containers.readByRef(containerReference);

        await rootContainer.execContainer('test -x /command/s6-svstat');
        await rootContainer.execContainer('/command/s6-svstat /run/service/network-node');
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: optional sidecars are ready when present`, async (): Promise<void> => {
      testLogger.info(`${testName}: validating sidecars`);

      const k8: K8 = this.getK8(options);
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

      expect(pods.length, 'expected at least one network-node pod').to.be.greaterThan(0);

      for (const pod of pods) {
        const podName: string = pod.podReference.name.toString();

        for (const sidecarName of this.SIDECAR_NAMES) {
          const hasSidecar: string = this.kubectlJsonPath(
            options,
            deploymentNamespace,
            podName,
            `{.spec.containers[?(@.name=='${sidecarName}')].name}`,
          );

          if (!hasSidecar) {
            continue;
          }

          const readyStatus: string = this.kubectlJsonPath(
            options,
            deploymentNamespace,
            podName,
            `{.status.containerStatuses[?(@.name=='${sidecarName}')].ready}`,
          ).toUpperCase();

          expect(readyStatus, `sidecar ${sidecarName} should be ready in pod ${podName}`).to.equal('TRUE');
        }
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: gateway tcproutes are accepted when present`, async (): Promise<void> => {
      testLogger.info(`${testName}: validating tcproute acceptance`);

      let routeList: TcpRouteList;
      try {
        routeList = this.kubectlJson<TcpRouteList>(options, deploymentNamespace, ['get', 'tcproute', '-o', 'json']);
      } catch {
        return;
      }

      const routes: TcpRouteItem[] = (routeList.items ?? []).filter((route): boolean =>
        (route.metadata?.name ?? '').startsWith('node-grpc-route-'),
      );

      for (const route of routes) {
        const accepted: boolean = (route.status?.parents ?? []).some((parent): boolean =>
          (parent.conditions ?? []).some(
            (condition): boolean => condition.type === 'Accepted' && condition.status === 'True',
          ),
        );

        expect(accepted, `tcproute ${route.metadata?.name} should be accepted`).to.equal(true);
      }
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
