// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {StorageClassHelper} from '../../../../src/core/storage-class-helper.js';
import {type StorageClass} from '../../../../src/integration/kube/resources/storage-class/storage-class.js';
import {LOCAL_PATH_PROVISIONER, LOCAL_PATH_STORAGE_CLASS} from '../../../../src/core/constants.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

function buildK8(
  storageClasses: StorageClass[],
  applyManifestCallCount: {value: number},
  patchObjectCallCount: {value: number},
): K8 {
  return {
    storageClasses: (): unknown => ({
      list: async (): Promise<StorageClass[]> => storageClasses,
    }),
    manifests: (): unknown => ({
      applyManifest: async (): Promise<void> => {
        applyManifestCallCount.value++;
      },
      patchObject: async (): Promise<void> => {
        patchObjectCallCount.value++;
      },
    }),
  } as unknown as K8;
}

const stubLogger: SoloLogger = {
  debug: (): void => {},
  showUser: (): void => {},
} as unknown as SoloLogger;

describe('StorageClassHelper.resolveStorageClass', (): void => {
  it('returns user-supplied class when it exists in the cluster', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: 'fast-ssd', provisioner: 'pd.csi.storage.gke.io', isDefault: false},
      {name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true},
    ];
    const applyCount: {value: number} = {value: 0};
    const patchCount: {value: number} = {value: 0};
    const k8: K8 = buildK8(storageClasses, applyCount, patchCount);

    const result: string = await StorageClassHelper.resolveStorageClass(k8, stubLogger, 'fast-ssd');

    expect(result).to.equal('fast-ssd');
    expect(applyCount.value).to.equal(0);
    expect(patchCount.value).to.equal(0);
  });

  it('throws when user-supplied class does not exist in the cluster', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [{name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true}];
    const applyCount: {value: number} = {value: 0};
    const patchCount: {value: number} = {value: 0};
    const k8: K8 = buildK8(storageClasses, applyCount, patchCount);

    await expect(StorageClassHelper.resolveStorageClass(k8, stubLogger, 'nonexistent-class')).to.be.rejectedWith(
      "StorageClass 'nonexistent-class' not found in cluster",
    );
    expect(applyCount.value).to.equal(0);
    expect(patchCount.value).to.equal(0);
  });

  it('returns the cluster default StorageClass name when no user-supplied class is given', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: 'slow-hdd', provisioner: 'some.provisioner', isDefault: false},
      {name: 'standard', provisioner: 'pd.csi.storage.gke.io', isDefault: true},
    ];
    const applyCount: {value: number} = {value: 0};
    const patchCount: {value: number} = {value: 0};
    const k8: K8 = buildK8(storageClasses, applyCount, patchCount);

    const result: string = await StorageClassHelper.resolveStorageClass(k8, stubLogger, '');

    expect(result).to.equal('standard');
    expect(applyCount.value).to.equal(0);
    expect(patchCount.value).to.equal(0);
  });

  it('returns the local-path class name when no default exists but local-path is present', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [
      {name: LOCAL_PATH_STORAGE_CLASS, provisioner: LOCAL_PATH_PROVISIONER, isDefault: false},
    ];
    const applyCount: {value: number} = {value: 0};
    const patchCount: {value: number} = {value: 0};
    const k8: K8 = buildK8(storageClasses, applyCount, patchCount);

    const result: string = await StorageClassHelper.resolveStorageClass(k8, stubLogger, '');

    expect(result).to.equal(LOCAL_PATH_STORAGE_CLASS);
    expect(applyCount.value).to.equal(0);
    expect(patchCount.value).to.equal(0);
  });

  it('installs local-path-provisioner, sets it as default, and returns its name when no StorageClass exists', async (): Promise<void> => {
    const storageClasses: StorageClass[] = [];
    const applyCount: {value: number} = {value: 0};
    const patchCount: {value: number} = {value: 0};
    const k8: K8 = buildK8(storageClasses, applyCount, patchCount);

    const result: string = await StorageClassHelper.resolveStorageClass(k8, stubLogger, '');

    expect(result).to.equal(LOCAL_PATH_STORAGE_CLASS);
    expect(applyCount.value).to.equal(1);
    expect(patchCount.value).to.equal(1);
  });
});
