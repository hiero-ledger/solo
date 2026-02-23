// SPDX-License-Identifier: Apache-2.0

import {type Rbacs} from '../../../resources/rbac/rbacs.js';
import {type ClusterRole} from '../../../resources/rbac/cluster-role.js';
import {type RbacAuthorizationV1Api} from '@kubernetes/client-node';
import {K8ClientClusterRole} from './k8-client-cluster-role.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceDeleteError} from '../../../errors/resource-operation-errors.js';

export class K8ClientRbacs implements Rbacs {
  public constructor(private readonly k8sRbacApi: RbacAuthorizationV1Api) {}

  public async createClusterRole(
    name: string,
    rules: Array<{
      apiGroups: string[];
      resources: string[];
      verbs: string[];
    }>,
    labels?: Record<string, string>,
  ): Promise<void> {
    const clusterRole: ClusterRole = new K8ClientClusterRole(name, rules, labels);
    try {
      await this.k8sRbacApi.createClusterRole({body: clusterRole.toV1ClusterRole()});
    } catch (error) {
      KubeApiResponse.throwError(error.response, ResourceOperation.CREATE, ResourceType.RBAC, undefined, name);
    }
  }

  public async clusterRoleExists(name: string): Promise<boolean> {
    try {
      await this.k8sRbacApi.readClusterRole({name});
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        return false;
      }
      KubeApiResponse.throwError(error, ResourceOperation.READ, ResourceType.RBAC, undefined, name);
    }

    return true;
  }

  public async deleteClusterRole(name: string): Promise<void> {
    try {
      await this.k8sRbacApi.deleteClusterRole({name});
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.DELETE, ResourceType.RBAC, undefined, name);
    }
  }

  public async clusterRoleBindingExists(name: string): Promise<boolean> {
    try {
      await this.k8sRbacApi.readClusterRoleBinding({name});
      return true;
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  public async deleteClusterRoleBinding(name: string): Promise<void> {
    try {
      await this.k8sRbacApi.deleteClusterRoleBinding({name});
    } catch (error) {
      throw new ResourceDeleteError(ResourceType.RBAC, undefined, name, error);
    }
  }
}
