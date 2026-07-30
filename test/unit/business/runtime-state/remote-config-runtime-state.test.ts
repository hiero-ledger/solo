// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach} from 'mocha';
import sinon from 'sinon';
import {RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {RemoteConfigMissingOnKindClusterError} from '../../../../src/core/errors/classes/config/remote-config-missing-on-kind-cluster-error.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type ObjectMapper} from '../../../../src/data/mapper/api/object-mapper.js';
import {ResourceOperation} from '../../../../src/integration/kube/resources/resource-operation.js';
import {ResourceType} from '../../../../src/integration/kube/resources/resource-type.js';
import {ResourceNotFoundError} from '../../../../src/integration/kube/errors/resource-operation-errors.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type RemoteConfigValidatorApi} from '../../../../src/core/config/remote/api/remote-config-validator-api.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';

describe('RemoteConfigRuntimeState', (): void => {
  const namespace: NamespaceName = NamespaceName.of('solo');
  const deploymentName: string = 'solo-deployment';

  let configManager: ConfigManager;
  let readStub: sinon.SinonStub;

  function newRuntimeState(context: string): RemoteConfigRuntimeState {
    const flagValues: Map<string, unknown> = new Map<string, unknown>([
      [flags.namespace.name, namespace.name],
      [flags.deployment.name, deploymentName],
      [flags.context.name, context],
    ]);

    configManager = {
      getFlag: (flag: {name: string}): unknown => flagValues.get(flag.name),
      setFlag: (flag: {name: string}, value: unknown): void => {
        flagValues.set(flag.name, value);
      },
      hasFlag: (flag: {name: string}): boolean => flagValues.has(flag.name),
    } as unknown as ConfigManager;

    // No deployment in local config sends populateClusterReferences down its fallback path, which
    // resolves the namespace and context from the flags above.
    const localConfig: LocalConfigRuntimeState = {
      configuration: {
        deploymentByName: (): never => {
          throw new SoloErrors.deployment.notFound(deploymentName);
        },
      },
    } as unknown as LocalConfigRuntimeState;

    const k8Factory: K8Factory = {
      getK8: (): {configMaps: () => {read: sinon.SinonStub}} => ({
        configMaps: (): {read: sinon.SinonStub} => ({read: readStub}),
      }),
    } as unknown as K8Factory;

    const logger: SoloLogger = {
      info: (): void => {},
      warn: (): void => {},
      debug: (): void => {},
    } as unknown as SoloLogger;

    return new RemoteConfigRuntimeState(
      k8Factory,
      logger,
      localConfig,
      configManager,
      {} as unknown as RemoteConfigValidatorApi,
      {} as unknown as ObjectMapper,
    );
  }

  beforeEach((): void => {
    readStub = sinon.stub();
  });

  const argv: ArgvStruct = {_: ['mirror', 'node', 'add']} as unknown as ArgvStruct;

  it('reports a missing remote config on a kind cluster as recoverable', async (): Promise<void> => {
    readStub.rejects(
      new ResourceNotFoundError(ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, 'solo-remote-config'),
    );

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(RemoteConfigMissingOnKindClusterError);
      const recoverable: RemoteConfigMissingOnKindClusterError = error as RemoteConfigMissingOnKindClusterError;
      expect(recoverable.deploymentName).to.equal(deploymentName);
      expect(recoverable.namespace).to.equal(namespace.name);
      expect(recoverable.context).to.equal('kind-solo');
      expect(recoverable.getFormattedCode()).to.equal('SOLO-1005');
    }
  });

  it('reports a nullish remote config read on a kind cluster as recoverable', async (): Promise<void> => {
    readStub.resolves();

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    await expect(runtimeState.loadAndValidate(argv)).to.be.rejectedWith(RemoteConfigMissingOnKindClusterError);
  });

  it('fails fast on a missing remote config outside a kind cluster', async (): Promise<void> => {
    const notFound: ResourceNotFoundError = new ResourceNotFoundError(
      ResourceOperation.READ,
      ResourceType.CONFIG_MAP,
      namespace,
      'solo-remote-config',
    );
    readStub.rejects(notFound);

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('gke_my-project_us-central1_my-cluster');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.not.be.instanceOf(RemoteConfigMissingOnKindClusterError);
      expect(error).to.be.instanceOf(ResourceNotFoundError);
    }
  });

  it('leaves an unrelated load failure untouched on a kind cluster', async (): Promise<void> => {
    readStub.rejects(new Error('connection refused'));

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.not.be.instanceOf(RemoteConfigMissingOnKindClusterError);
    }
  });
});
