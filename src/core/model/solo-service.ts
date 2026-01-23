// SPDX-License-Identifier: Apache-2.0

import {type ClusterReferenceName, type DeploymentName} from '../../types/index.js';
import {type ObjectMeta} from '../../integration/kube/resources/object-meta.js';
import {type ServiceSpec} from '../../integration/kube/resources/service/service-spec.js';
import {type ServiceStatus} from '../../integration/kube/resources/service/service-status.js';
import {type Service} from '../../integration/kube/resources/service/service.js';
import {K8ClientService} from '../../integration/kube/k8-client/resources/service/k8-client-service.js';

export class SoloService extends K8ClientService {
  private constructor(
    public override readonly metadata: ObjectMeta,
    public override readonly spec: ServiceSpec,
    public override readonly status?: ServiceStatus,
    public readonly clusterReference?: ClusterReferenceName,
    public readonly context?: string,
    public readonly deployment?: string,
  ) {
    super(metadata, spec, status);
  }

  public static getFromK8Service(
    service: Service,
    clusterReference: ClusterReferenceName,
    context: string,
    deployment: DeploymentName,
  ): SoloService {
    return new SoloService(service.metadata, service.spec, service.status, clusterReference, context, deployment);
  }
}
