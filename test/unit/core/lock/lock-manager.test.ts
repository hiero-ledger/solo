// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {LockManager} from '../../../../src/core/lock/lock-manager.js';
import {type IntervalLock} from '../../../../src/core/lock/interval-lock.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {type CommandFlag} from '../../../../src/types/flag-types.js';
import {type LockRenewalService} from '../../../../src/core/lock/lock-renewal-service.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';

describe('LockManager', (): void => {
  const remoteConfigNotLoaded: RemoteConfigRuntimeStateApi = {
    getNamespace: (): NamespaceName => {
      throw new SoloErrors.internal.readRemoteConfigBeforeLoad();
    },
  } as unknown as RemoteConfigRuntimeStateApi;

  // a deployment spanning two clusters; the remote config is the same on both clusters
  const multiClusterRemoteConfig: RemoteConfigRuntimeStateApi = {
    getNamespace: (): NamespaceName => NamespaceName.of('solo-ns'),
    configuration: {
      clusters: [
        {name: 'cluster-1', namespace: 'solo-ns'},
        {name: 'cluster-2', namespace: 'solo-ns'},
      ],
    },
  } as unknown as RemoteConfigRuntimeStateApi;

  function createLockManager(
    remoteConfig: RemoteConfigRuntimeStateApi,
    flagValues: Record<string, unknown>,
    currentContext: string,
  ): LockManager {
    const localConfig: LocalConfigRuntimeState = {
      configuration: {
        clusterRefs: new Map<string, string>([
          ['cluster-1', 'context-1'],
          ['cluster-2', 'context-2'],
        ]),
      },
    } as unknown as LocalConfigRuntimeState;
    const configManager: ConfigManager = {
      getFlag: (flag: CommandFlag): unknown => flagValues[flag.name],
    } as unknown as ConfigManager;
    const k8Factory: K8Factory = {
      getK8: (): K8 => ({namespaces: (): object => ({has: async (): Promise<boolean> => true})}) as unknown as K8,
      default: (): K8 => ({contexts: (): object => ({readCurrent: (): string => currentContext})}) as unknown as K8,
    };

    return new LockManager(
      {} as LockRenewalService,
      {} as SoloLogger,
      k8Factory,
      configManager,
      remoteConfig,
      localConfig,
    );
  }

  it('should lock the first cluster of the deployment, whatever the --context flag or the kube current context', async (): Promise<void> => {
    const lockManager: LockManager = createLockManager(
      multiClusterRemoteConfig,
      {[flags.context.name]: 'context-2'},
      'context-2',
    );

    const lock: IntervalLock = (await lockManager.create()) as IntervalLock;

    expect(lock.context).to.equal('context-1');
    expect(lock.namespace.name).to.equal('solo-ns');
  });

  it('should use the --context flag when the remote config is not loaded', async (): Promise<void> => {
    const lockManager: LockManager = createLockManager(
      remoteConfigNotLoaded,
      {[flags.context.name]: 'context-2', [flags.namespace.name]: NamespaceName.of('solo-ns')},
      'context-1',
    );

    const lock: IntervalLock = (await lockManager.create()) as IntervalLock;

    expect(lock.context).to.equal('context-2');
    expect(lock.namespace.name).to.equal('solo-ns');
  });

  it('should use the kube current context when the remote config is not loaded and no --context is given', async (): Promise<void> => {
    const lockManager: LockManager = createLockManager(
      remoteConfigNotLoaded,
      {[flags.clusterSetupNamespace.name]: NamespaceName.of('solo-setup')},
      'context-1',
    );

    const lock: IntervalLock = (await lockManager.create()) as IntervalLock;

    expect(lock.context).to.equal('context-1');
    expect(lock.namespace.name).to.equal('solo-setup');
  });
});
