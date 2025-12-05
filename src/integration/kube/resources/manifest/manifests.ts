// SPDX-License-Identifier: Apache-2.0

/**
 * Interface CRUD on manifests.
 */
export interface Manifests {
  applyManifest(filePath: string): Promise<void>;
}
