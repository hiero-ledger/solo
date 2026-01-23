// SPDX-License-Identifier: Apache-2.0

import {type Pvcs} from '../../../resources/pvc/pvcs.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {
  V1ObjectMeta,
  V1PersistentVolumeClaim,
  V1PersistentVolumeClaimSpec,
  V1VolumeResourceRequirements,
  type CoreV1Api,
  type V1PersistentVolumeClaimList,
} from '@kubernetes/client-node';
import {Duration} from '../../../../../core/time/duration.js';
import {type Pvc} from '../../../resources/pvc/pvc.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {K8ClientPvc} from './k8-client-pvc.js';
import {type PvcReference} from '../../../resources/pvc/pvc-reference.js';

export class K8ClientPvcs implements Pvcs {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async delete(pvcReference: PvcReference): Promise<boolean> {
    try {
      await this.kubeClient.deleteNamespacedPersistentVolumeClaim({
        name: pvcReference.name.toString(),
        namespace: pvcReference.namespace.toString(),
      });
    } catch (error) {
      throw new SoloError(
        `Failed to delete pvc [pvc=${pvcReference.name.toString()}, ns=${pvcReference.namespace.toString()}], error: ${error.message}`,
      );
    }
    return true;
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<string[]> {
    const pvcs: string[] = [];
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let resp: V1PersistentVolumeClaimList;
    try {
      resp = await this.kubeClient.listNamespacedPersistentVolumeClaim({
        namespace: namespace.name,
        labelSelector,
        timeoutSeconds: Duration.ofMinutes(5).toMillis(),
      });
    } catch (error) {
      throw new SoloError('Failed to list pvcs', error);
    }

    for (const item of resp.items) {
      pvcs.push(item.metadata!.name as string);
    }

    return pvcs;
  }

  public async create(pvcReference: PvcReference, labels: Record<string, string>, accessModes: string[]): Promise<Pvc> {
    const v1VolumeResourceRequirements: V1VolumeResourceRequirements = new V1VolumeResourceRequirements();
    v1VolumeResourceRequirements.requests = labels;

    const v1Spec: V1PersistentVolumeClaimSpec = new V1PersistentVolumeClaimSpec();
    v1Spec.accessModes = accessModes;
    v1Spec.resources = v1VolumeResourceRequirements;

    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = pvcReference.name.toString();

    const v1Pvc: V1PersistentVolumeClaim = new V1PersistentVolumeClaim();
    v1Pvc.spec = v1Spec;
    v1Pvc.metadata = v1Metadata;

    let result: V1PersistentVolumeClaim;
    try {
      result = await this.kubeClient.createNamespacedPersistentVolumeClaim({
        namespace: pvcReference.namespace.toString(),
        body: v1Pvc,
      });
    } catch (error) {
      throw new SoloError('Failed to create pvc', error);
    }

    if (result) {
      return new K8ClientPvc(pvcReference);
    } else {
      throw new SoloError('Failed to create pvc');
    }
  }
}
