// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {RemoteConfigValidator} from '../../../../../src/core/config/remote/remote-config-validator.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';
import {DeploymentPhase} from '../../../../../src/data/schema/model/remote/deployment-phase.js';
import {type DeploymentStateSchema} from '../../../../../src/data/schema/model/remote/deployment-state-schema.js';
import {type K8Factory} from '../../../../../src/integration/kube/k8-factory.js';
import {type LocalConfigRuntimeState} from '../../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type ChartManager} from '../../../../../src/core/chart-manager.js';

describe('RemoteConfigValidator', (): void => {
  const namespace: NamespaceName = NamespaceName.of('one-shot');

  const mirrorNodeState: DeploymentStateSchema = {
    relayNodes: [],
    haProxies: [],
    mirrorNodes: [{metadata: {id: 1, namespace: 'one-shot', cluster: 'one-shot', phase: DeploymentPhase.DEPLOYED}}],
    envoyProxies: [],
    explorers: [],
    consensusNodes: [],
    blockNodes: [],
  } as unknown as DeploymentStateSchema;

  function createValidator(podsPerCall: number[]): {validator: RemoteConfigValidator; calls: () => number} {
    let callCount: number = 0;
    const k8Factory: K8Factory = {
      getK8: (): object => ({
        pods: (): object => ({
          list: async (): Promise<object[]> => {
            const podCount: number = podsPerCall[Math.min(callCount, podsPerCall.length - 1)];
            callCount++;
            return Array.from({length: podCount}, (): object => ({}));
          },
        }),
      }),
    } as unknown as K8Factory;
    const localConfig: LocalConfigRuntimeState = {
      configuration: {clusterRefs: {get: (): string => 'kind-solo-cluster'}},
    } as unknown as LocalConfigRuntimeState;
    const chartManager: ChartManager = {
      isChartInstalled: async (): Promise<boolean> => false,
    } as unknown as ChartManager;

    return {
      validator: new RemoteConfigValidator(k8Factory, localConfig, chartManager),
      calls: (): number => callCount,
    };
  }

  it('passes immediately when the component pod exists', async (): Promise<void> => {
    const {validator, calls} = createValidator([1]);
    await validator.validateComponents(namespace, true, mirrorNodeState);
    expect(calls()).to.equal(1);
  });

  it('waits for a pod that is still being recreated', async (): Promise<void> => {
    const {validator, calls} = createValidator([0, 0, 1]);
    await validator.validateComponents(namespace, true, mirrorNodeState);
    expect(calls()).to.equal(3);
  }).timeout(15_000);
});
