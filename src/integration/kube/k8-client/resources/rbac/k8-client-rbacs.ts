// SPDX-License-Identifier: Apache-2.0

import {type Rbacs} from '../../../resources/rbac/rbacs.js';
import {type ClusterRole} from '../../../resources/rbac/cluster-role.js';
import {type RbacAuthorizationV1Api} from '@kubernetes/client-node';
import {K8ClientClusterRole} from './k8-client-cluster-role.js';

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
    await this.k8sRbacApi.createClusterRole({body: clusterRole.toV1ClusterRole()});
  }

  public async clusterRoleExists(name: string): Promise<boolean> {
    try {
      await this.k8sRbacApi.readClusterRole({name});
    } catch {
      return false;
    }

    return true;
  }

  public async deleteClusterRole(name: string): Promise<void> {
    await this.k8sRbacApi.deleteClusterRole({name});
  }
}
