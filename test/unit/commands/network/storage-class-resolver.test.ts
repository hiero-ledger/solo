// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {NetworkCommand} from '../../../../src/commands/network.js';
import {type StorageClass} from '../../../../src/integration/kube/resources/storage-class/storage-class.js';

type ResolveStorageClass = (contexts: string[], userSuppliedClass: string) => Promise<string>;

function createNetworkCommandWithStorageClasses(
  storageClasses: StorageClass[],
  installManifestCallCount: {value: number},
): NetworkCommand {
  const networkCommand: NetworkCommand = Object.create(NetworkCommand.prototype) as NetworkCommand;

  (networkCommand as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): unknown => ({
      storageClasses: (): unknown => ({
        list: async (): Promise<StorageClass[]> => storageClasses,
      }),
      manifests: (): unknown => ({
        installManifest: async (): Promise<void> => {
          installManifestCallCount.value++;
        },
      }),
    }),
  };

  (networkCommand as unknown as {logger: unknown}).logger = {
    debug: (): void => {},
    showUser: (): void => {},
  };

  return networkCommand;
}

function invokeResolveStorageClass(
  networkCommand: NetworkCommand,
  contexts: string[],
  userSuppliedClass: string,
): Promise<string> {
  const resolveFunction: ResolveStorageClass = (networkCommand as unknown as Record<string, ResolveStorageClass>)
    .resolveStorageClass;

  return resolveFunction.call(networkCommand, contexts, userSuppliedClass);
}

describe('NetworkCommand resolveStorageClass', (): void => {
  it('returns user-supplied class when it exists in the cluster', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: 'fast-ssd', provisioner: 'pd.csi.storage.gke.io', isDefault: false},
      {name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true},
    ];
    const installCount: {value: number} = {value: 0};
    const command: NetworkCommand = createNetworkCommandWithStorageClasses(storageClasses, installCount);

    const result: string = await invokeResolveStorageClass(command, ['kind-solo'], 'fast-ssd');

    expect(result).to.equal('fast-ssd');
    expect(installCount.value).to.equal(0);
  });

  it('throws when user-supplied class does not exist in the cluster', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [{name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true}];
    const installCount: {value: number} = {value: 0};
    const command: NetworkCommand = createNetworkCommandWithStorageClasses(storageClasses, installCount);

    await expect(invokeResolveStorageClass(command, ['kind-solo'], 'nonexistent-class')).to.be.rejectedWith(
      "StorageClass 'nonexistent-class' not found in cluster",
    );
    expect(installCount.value).to.equal(0);
  });

  it('returns the cluster default StorageClass when no user-supplied class is given', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: 'slow-hdd', provisioner: 'some.provisioner', isDefault: false},
      {name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true},
    ];
    const installCount: {value: number} = {value: 0};
    const command: NetworkCommand = createNetworkCommandWithStorageClasses(storageClasses, installCount);

    const result: string = await invokeResolveStorageClass(command, ['kind-solo'], '');

    expect(result).to.equal('standard');
    expect(installCount.value).to.equal(0);
  });

  it('returns the rancher.io/local-path class when no default exists', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: 'local-path', provisioner: 'rancher.io/local-path', isDefault: false},
    ];
    const installCount: {value: number} = {value: 0};
    const command: NetworkCommand = createNetworkCommandWithStorageClasses(storageClasses, installCount);

    const result: string = await invokeResolveStorageClass(command, ['kind-solo'], '');

    expect(result).to.equal('local-path');
    expect(installCount.value).to.equal(0);
  });

  it('installs local-path-provisioner and returns local-path when no StorageClass exists', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [];
    const installCount: {value: number} = {value: 0};
    const command: NetworkCommand = createNetworkCommandWithStorageClasses(storageClasses, installCount);

    const result: string = await invokeResolveStorageClass(command, ['kind-solo'], '');

    expect(result).to.equal('local-path');
    expect(installCount.value).to.equal(1);
  });
});
