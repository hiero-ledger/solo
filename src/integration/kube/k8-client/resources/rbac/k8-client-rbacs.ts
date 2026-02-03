// SPDX-License-Identifier: Apache-2.0

import {type Rbacs} from '../../../resources/rbac/rbacs.js';
import {type ClusterRole} from '../../../resources/rbac/cluster-role.js';
import {type V1ClusterRole, type RbacAuthorizationV1Api, type V1Status} from '@kubernetes/client-node';
import {K8ClientClusterRole} from './k8-client-cluster-role.js';
import {ResourceCreateError, ResourceDeleteError} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';

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
    let result: V1ClusterRole;
    try {
      result = await this.k8sRbacApi.createClusterRole({body: clusterRole.toV1ClusterRole()});
    } catch (error) {
      throw new ResourceCreateError(ResourceType.RBAC, undefined, name, error);
    }

    // KubeApiResponse.check(result.response, ResourceOperation.CREATE, ResourceType.RBAC, undefined, name);
  }

  public async clusterRoleExists(name: string): Promise<boolean> {
    let result: V1ClusterRole;
    try {
      result = await this.k8sRbacApi.readClusterRole({name});
    } catch {
      return false;
    }

    // try {
    //   KubeApiResponse.check(result.response, ResourceOperation.READ, ResourceType.RBAC, undefined, name);
    // } catch {
    //   return false;
    // }

    return true;
  }

  public async deleteClusterRole(name: string): Promise<void> {
    let result: V1Status;
    try {
      result = await this.k8sRbacApi.deleteClusterRole({name});
    } catch (error) {
      throw new ResourceDeleteError(ResourceType.RBAC, undefined, name, error);
    }

    // KubeApiResponse.check(result.response, ResourceOperation.DELETE, ResourceType.RBAC, undefined, name);
  }
}
