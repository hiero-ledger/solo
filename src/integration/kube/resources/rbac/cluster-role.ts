// SPDX-License-Identifier: Apache-2.0

import {type V1ClusterRole} from '@kubernetes/client-node';

export interface ClusterRole {
  /**
   * The name of the cluster role
   */
  readonly name: string;

  /**
   * The labels of the cluster role
   */
  readonly labels?: Record<string, string>;

  /**
   * The rules of the cluster role
   */
  readonly rules: Array<{
    apiGroups: string[];
    resources: string[];
    verbs: string[];
  }>;

  /**
   * Convert to V1ClusterRole
   */
  toV1ClusterRole(): V1ClusterRole;
}
