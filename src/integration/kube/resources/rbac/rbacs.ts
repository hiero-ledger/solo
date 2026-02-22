// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for RBAC operations
 */
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

  /**
   * Check if a ClusterRole exists
   * @param name The name of the cluster role
   * @returns True if the cluster role exists, false otherwise
   */
  clusterRoleExists(name: string): Promise<boolean>;

  /**
   * Delete a ClusterRole
   * @param name The name of the cluster role
   */
  deleteClusterRole(name: string): Promise<void>;

  /**
   * Check if a ClusterRoleBinding exists
   * @param name The name of the cluster role binding
   * @returns True if the cluster role binding exists, false otherwise
   */
  clusterRoleBindingExists(name: string): Promise<boolean>;

  /**
   * Delete a ClusterRoleBinding
   * @param name The name of the cluster role binding
   */
  deleteClusterRoleBinding(name: string): Promise<void>;
}
