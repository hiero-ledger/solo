// SPDX-License-Identifier: Apache-2.0

/**
 * Outcome of a cluster-reachability probe. When `reachable` is false, `reason`
 * carries a short human-readable explanation suitable for showing to the user.
 */
export interface ClusterReachability {
  reachable: boolean;
  reason?: string;
}
