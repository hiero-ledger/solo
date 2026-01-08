// SPDX-License-Identifier: Apache-2.0

export interface Rbacs {
  /**
   * Create a ClusterRole
   * @param name The name of the cluster role
   * @param rules The rules of the cluster role
   * @param labels The labels of the cluster role
   */
  createClusterRole(
    name: string,
    rules: Array<{
      apiGroups: string[];
      resources: string[];
      verbs: string[];
    }>,
    labels?: Record<string, string>,
  ): Promise<void>;
  clusterRoleExists(): Promise<boolean>;
  deleteClusterRole(): Promise<void>;
}
