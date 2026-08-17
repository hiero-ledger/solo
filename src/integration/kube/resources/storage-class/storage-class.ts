// SPDX-License-Identifier: Apache-2.0

/**
 * StorageClass represents a Kubernetes StorageClass.
 */
export interface StorageClass {
  /**
   * Name of the StorageClass.
   */
  readonly name: string;

  /**
   * The provisioner that handles this StorageClass (e.g. rancher.io/local-path).
   */
  readonly provisioner: string;

  /**
   * Whether this StorageClass is the cluster default
   * (annotated with storageclass.kubernetes.io/is-default-class=true).
   */
  readonly isDefault: boolean;
}
