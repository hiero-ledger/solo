// SPDX-License-Identifier: Apache-2.0

/**
 * Interface CRUD on manifests.
 */
export interface Manifests {
  applyManifest(filePath: string): Promise<void>;
  scaleStatefulSet(namespace: string, statefulSetName: string, replicas: number): Promise<void>;
  scaleDeployment(namespace: string, deploymentName: string, replicas: number): Promise<void>;
  scaleDeployments(namespace: string, labelSelector: string, replicas: number): Promise<number>;
}
