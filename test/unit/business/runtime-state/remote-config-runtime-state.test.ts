// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {ClusterUnreachableError} from '../../../../src/core/errors/classes/system/cluster-unreachable-error.js';
import {KubernetesApiInvalidResponseSoloError} from '../../../../src/core/errors/classes/system/kubernetes-api-invalid-response-solo-error.js';
import {ResourceNotFoundError} from '../../../../src/integration/kube/errors/resource-operation-errors.js';
import {ResourceOperation} from '../../../../src/integration/kube/resources/resource-operation.js';
import {ResourceType} from '../../../../src/integration/kube/resources/resource-type.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type Context} from '../../../../src/types/index.js';

const namespace: NamespaceName = NamespaceName.of('solo');

/** Builds a runtime state whose ConfigMap read always fails with the given error. */
function runtimeStateFailingWith(readError: Error): RemoteConfigRuntimeState {
  const k8Factory: K8Factory = {
    getK8: (): unknown => ({
      configMaps: (): unknown => ({
        read: (): Promise<never> => Promise.reject(readError),
      }),
    }),
  } as unknown as K8Factory;

  // Only the K8Factory is exercised; the remaining dependencies are non-null so they are not resolved
  // from the container.
  return new RemoteConfigRuntimeState(
    k8Factory,
    {} as unknown as never,
    {} as unknown as never,
    {} as unknown as never,
    {} as unknown as never,
    {} as unknown as never,
  );
}

/** Resolves with the error thrown while reading the remote config ConfigMap over the given context. */
async function readFailure(readError: Error, context: Context): Promise<Error> {
  return await runtimeStateFailingWith(readError)
    .remoteConfigExists(namespace, context)
    .then(
      (): Error => undefined,
      (error: Error): Error => error,
    );
}

describe('RemoteConfigRuntimeState', (): void => {
  it('should throw ClusterUnreachableError preserving the cause for a non-kind context', async (): Promise<void> => {
    const cause: Error = new Error('connect ECONNREFUSED 10.0.0.1:6443');

    const error: Error = await readFailure(cause, 'production-cluster');

    expect(error).to.be.instanceOf(ClusterUnreachableError);
    expect(error.message).to.contain('production-cluster');
    expect(error.message).to.contain('connect ECONNREFUSED 10.0.0.1:6443');
    expect(error.cause).to.equal(cause);
  });

  it('should throw KubernetesApiInvalidResponseSoloError preserving the cause for a kind context', async (): Promise<void> => {
    const cause: Error = new Error('configmaps is forbidden: User cannot list resource');

    const error: Error = await readFailure(cause, 'kind-solo');

    expect(error).to.be.instanceOf(KubernetesApiInvalidResponseSoloError);
    expect(error.message).to.contain('configmaps is forbidden: User cannot list resource');
    expect(error.cause).to.equal(cause);
  });

  it('should rethrow ResourceNotFoundError untouched', async (): Promise<void> => {
    const notFound: ResourceNotFoundError = new ResourceNotFoundError(
      ResourceOperation.READ,
      ResourceType.CONFIG_MAP,
      namespace,
      'solo-remote-config',
    );

    const error: Error = await readFailure(notFound, 'production-cluster');

    expect(error).to.equal(notFound);
  });
});
