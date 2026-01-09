// SPDX-License-Identifier: Apache-2.0

import {
  type CoordinationV1Api,
  V1Lease,
  V1LeaseSpec,
  V1MicroTime,
  V1ObjectMeta,
  type V1Status,
} from '@kubernetes/client-node';
import {type Leases} from '../../../resources/lease/leases.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {K8ClientLease} from './k8-client-lease.js';
import {type Lease} from '../../../resources/lease/lease.js';
import {
  ResourceCreateError,
  ResourceDeleteError,
  ResourceReadError,
  ResourceReplaceError,
} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';

export class K8ClientLeases implements Leases {
  private readonly logger: SoloLogger;

  public constructor(private readonly coordinationApiClient: CoordinationV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async create(
    namespace: NamespaceName,
    leaseName: string,
    holderName: string,
    durationSeconds: number,
  ): Promise<Lease> {
    const lease: V1Lease = new V1Lease();

    const metadata: V1ObjectMeta = new V1ObjectMeta();
    metadata.name = leaseName;
    metadata.namespace = namespace.name;
    lease.metadata = metadata;

    const spec: V1LeaseSpec = new V1LeaseSpec();
    spec.holderIdentity = holderName;
    spec.leaseDurationSeconds = durationSeconds;
    spec.acquireTime = new V1MicroTime();
    lease.spec = spec;

    let result: V1Lease;
    try {
      result = await this.coordinationApiClient.createNamespacedLease({namespace: namespace.name, body: lease});
    } catch (error) {
      throw new ResourceCreateError(ResourceType.LEASE, namespace, leaseName, error);
    }

    return K8ClientLease.fromV1Lease(result);
  }

  public async delete(namespace: NamespaceName, name: string): Promise<V1Status> {
    let result: V1Lease;
    try {
      result = await this.coordinationApiClient.deleteNamespacedLease({name, namespace: namespace.name});
    } catch (error) {
      throw new ResourceDeleteError(ResourceType.LEASE, namespace, name, error);
    }

    return result;
  }

  public async read(namespace: NamespaceName, leaseName: string, timesCalled: number = 0): Promise<Lease> {
    let result: V1Lease;
    try {
      result = await this.coordinationApiClient.readNamespacedLease({name: leaseName, namespace: namespace.name});
    } catch (error) {
      if (error.code === StatusCodes.INTERNAL_SERVER_ERROR && timesCalled < 4) {
        // could be k8s control plane has no resources available
        this.logger.debug(
          `Retrying readNamespacedLease(${leaseName}, ${namespace}) in 5 seconds because of ${getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR)}`,
        );
        await sleep(Duration.ofSeconds(5));
        try {
          return await this.read(namespace, leaseName, timesCalled + 1);
        } catch (error) {
          throw new ResourceReadError(ResourceType.LEASE, namespace, leaseName, error);
        }
      } else {
        throw new ResourceReadError(ResourceType.LEASE, namespace, leaseName, error);
      }
    }

    return K8ClientLease.fromV1Lease(result);
  }

  public async renew(namespace: NamespaceName, leaseName: string, lease: Lease): Promise<Lease> {
    const v1Lease: V1Lease = K8ClientLease.toV1Lease(lease);
    v1Lease.spec.renewTime = new V1MicroTime();

    let result: V1Lease;
    try {
      result = await this.coordinationApiClient.replaceNamespacedLease({
        name: leaseName,
        namespace: namespace.name,
        body: v1Lease,
      });
    } catch (error) {
      throw new ResourceReplaceError(ResourceType.LEASE, namespace, leaseName, error);
    }

    return K8ClientLease.fromV1Lease(result);
  }

  public async transfer(lease: Lease, newHolderName: string): Promise<Lease> {
    const v1Lease: V1Lease = K8ClientLease.toV1Lease(lease);
    v1Lease.spec.leaseTransitions++;
    v1Lease.spec.renewTime = new V1MicroTime();
    v1Lease.spec.holderIdentity = newHolderName;

    let result: V1Lease;
    try {
      result = await this.coordinationApiClient.replaceNamespacedLease({
        name: v1Lease.metadata.name,
        namespace: v1Lease.metadata.namespace,
        body: v1Lease,
      });
    } catch (error) {
      throw new ResourceReplaceError(ResourceType.LEASE, lease.namespace, v1Lease.metadata.name, error);
    }

    return K8ClientLease.fromV1Lease(result);
  }
}
