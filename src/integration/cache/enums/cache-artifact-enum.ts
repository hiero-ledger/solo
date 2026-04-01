// SPDX-License-Identifier: Apache-2.0

/**
 * Identifies the cache domain an item belongs to.
 *
 * IMAGE:
 *   Docker / OCI image artifacts.
 *
 * HELM_CHART:
 *   Helm chart artifacts pulled from OCI registries or chart repositories.
 */
export enum CacheArtifactEnum {
  IMAGE = 'IMAGE',
  HELM_CHART = 'HELM_CHART',
}
