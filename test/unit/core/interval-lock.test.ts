// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {IntervalLock} from '../../../src/core/lock/interval-lock.js';
import {LockHolder} from '../../../src/core/lock/lock-holder.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type LockRenewalService} from '../../../src/core/lock/lock.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {type Namespaces} from '../../../src/types/namespace/namespaces.js';
import {type Leases} from '../../../src/integration/kube/resources/lease/leases.js';
import {type Lease} from '../../../src/integration/kube/resources/lease/lease.js';
import {LockAcquisitionError} from '../../../src/core/lock/lock-acquisition-error.js';
import {StatusCodes} from 'http-status-codes';

describe('IntervalLock', () => {
  it('should ignore a renew conflict when latest lease is still held by the same process', async () => {
    const namespace: NamespaceName = NamespaceName.of('lock-conflict-test');
    const lockHolder: LockHolder = LockHolder.of('lock-user');
    const leaseName = 'lock-conflict-test';

    let readCalls = 0;
    let renewCalls = 0;
    let scheduleCalls = 0;

    const initialLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '1');
    const latestLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '2');

    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => {
        scheduleCalls++;
        return 99;
      },
      cancel: async (): Promise<boolean> => true,
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: () => {
        throw new Error('not used');
      },
    };

    const leases: Leases = {
      create: async (): Promise<Lease> => {
        throw new Error('not used');
      },
      delete: async () => {
        throw new Error('not used');
      },
      read: async (): Promise<Lease> => {
        readCalls++;
        return readCalls === 1 ? initialLease : latestLease;
      },
      renew: async (): Promise<Lease> => {
        renewCalls++;
        throw {meta: {statusCode: StatusCodes.CONFLICT}};
      },
      transfer: async (): Promise<Lease> => {
        throw new Error('not used');
      },
    };

    const namespaces: Namespaces = {
      create: async (): Promise<boolean> => true,
      delete: async (): Promise<boolean> => true,
      list: async (): Promise<NamespaceName[]> => [],
      has: async (): Promise<boolean> => true,
    };

    const k8: K8 = {
      namespaces: (): Namespaces => namespaces,
      leases: (): Leases => leases,
    } as unknown as K8;

    const k8Factory: K8Factory = {
      getK8: (): K8 => k8,
      default: (): K8 => k8,
    };

    const lock: IntervalLock = new IntervalLock(k8Factory, renewalService, lockHolder, namespace, leaseName, 20);
    await lock.renew();

    expect(readCalls).to.equal(2);
    expect(renewCalls).to.equal(1);
    expect(scheduleCalls).to.equal(1);
  });

  it('should fail renew when conflict resolution reads a lease owned by another holder', async () => {
    const namespace: NamespaceName = NamespaceName.of('lock-conflict-fail-test');
    const lockHolder: LockHolder = LockHolder.of('lock-user');
    const otherLockHolder: LockHolder = LockHolder.of('other-user');
    const leaseName = 'lock-conflict-fail-test';

    let readCalls = 0;

    const initialLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '1');
    const conflictingLease: Lease = createLease(namespace, leaseName, otherLockHolder.toJson(), '2');

    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => 99,
      cancel: async (): Promise<boolean> => true,
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: () => {
        throw new Error('not used');
      },
    };

    const leases: Leases = {
      create: async (): Promise<Lease> => {
        throw new Error('not used');
      },
      delete: async () => {
        throw new Error('not used');
      },
      read: async (): Promise<Lease> => {
        readCalls++;
        return readCalls === 1 ? initialLease : conflictingLease;
      },
      renew: async (): Promise<Lease> => {
        throw {meta: {statusCode: StatusCodes.CONFLICT}};
      },
      transfer: async (): Promise<Lease> => {
        throw new Error('not used');
      },
    };

    const namespaces: Namespaces = {
      create: async (): Promise<boolean> => true,
      delete: async (): Promise<boolean> => true,
      list: async (): Promise<NamespaceName[]> => [],
      has: async (): Promise<boolean> => true,
    };

    const k8: K8 = {
      namespaces: (): Namespaces => namespaces,
      leases: (): Leases => leases,
    } as unknown as K8;

    const k8Factory: K8Factory = {
      getK8: (): K8 => k8,
      default: (): K8 => k8,
    };

    const lock: IntervalLock = new IntervalLock(k8Factory, renewalService, lockHolder, namespace, leaseName, 20);
    await expect(lock.renew()).to.be.rejectedWith(LockAcquisitionError);
  });
});

function createLease(
  namespace: NamespaceName,
  leaseName: string,
  holderIdentity: string,
  resourceVersion: string,
): Lease {
  return {
    namespace,
    leaseName,
    holderIdentity,
    durationSeconds: 20,
    acquireTime: new Date(),
    renewTime: new Date(),
    resourceVersion,
  };
}
