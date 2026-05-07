// SPDX-License-Identifier: Apache-2.0

/**
 * Interface CRUD on manifests.
 */
export interface Manifests {
  applyManifest(filePath: string): Promise<void>;

  /**
   * Apply a manifest file idempotently — resources that already exist (HTTP 409) are skipped.
   * Equivalent to `kubectl apply -f <file>` for the create path.
   * @param filePath - path to a YAML manifest (may contain multiple documents)
   */
  installManifest(filePath: string): Promise<void>;

  /**
   * Patch an existing Kubernetes object (including custom resources) using a merge patch.
   * @param spec - a partial Kubernetes object with apiVersion, kind, metadata.name, metadata.namespace, and the fields to patch
   */
  patchObject(spec: object): Promise<void>;
}
