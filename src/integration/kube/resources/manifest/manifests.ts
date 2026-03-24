// SPDX-License-Identifier: Apache-2.0

/**
 * Interface CRUD on manifests.
 */
export interface Manifests {
  applyManifest(filePath: string): Promise<void>;

  /**
   * Patch an existing Kubernetes object (including custom resources) using a merge patch.
   * @param spec - a partial Kubernetes object with apiVersion, kind, metadata.name, metadata.namespace, and the fields to patch
   */
  patchObject(spec: object): Promise<void>;
}
