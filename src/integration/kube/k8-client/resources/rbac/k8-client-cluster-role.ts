// SPDX-License-Identifier: Apache-2.0

import {V1ClusterRole, V1ObjectMeta} from '@kubernetes/client-node';
import {type ClusterRole} from '../../../resources/rbac/cluster-role.js';

export class K8ClientClusterRole implements ClusterRole {
  public constructor(
    public readonly name: string,
    public readonly rules: Array<{
      apiGroups: string[];
      resources: string[];
      verbs: string[];
    }>,
    public readonly labels?: Record<string, string>,
  ) {}

  public toV1ClusterRole(): V1ClusterRole {
    const v1ClusterRole: V1ClusterRole = new V1ClusterRole();
    v1ClusterRole.apiVersion = 'rbac.authorization.k8s.io/v1';
    v1ClusterRole.kind = 'ClusterRole';

    const metadata: V1ObjectMeta = new V1ObjectMeta();
    metadata.name = this.name;
    if (this.labels) {
      metadata.labels = this.labels;
    }
    v1ClusterRole.metadata = metadata;

    v1ClusterRole.rules = this.rules.map((rule): {apiGroups: string[]; resources: string[]; verbs: string[]} => ({
      apiGroups: rule.apiGroups,
      resources: rule.resources,
      verbs: rule.verbs,
    }));

    return v1ClusterRole;
  }
}
