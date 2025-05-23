// SPDX-License-Identifier: Apache-2.0

import {type Services} from '../../../resources/service/services.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {V1ObjectMeta, V1Service, V1ServicePort, V1ServiceSpec, type CoreV1Api} from '@kubernetes/client-node';
import {K8ClientBase} from '../../k8-client-base.js';
import {type Service} from '../../../resources/service/service.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {K8ClientService} from './k8-client-service.js';
import {type ServiceSpec} from '../../../resources/service/service-spec.js';
import {type ServiceStatus} from '../../../resources/service/service-status.js';
import {type ServiceReference} from '../../../resources/service/service-reference.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {type IncomingMessage} from 'node:http';

export class K8ClientServices extends K8ClientBase implements Services {
  public constructor(private readonly kubeClient: CoreV1Api) {
    super();
  }

  public async list(namespace: NamespaceName, labels?: string[]): Promise<Service[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const serviceList = await this.kubeClient.listNamespacedService(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );
    KubeApiResponse.check(serviceList.response, ResourceOperation.LIST, ResourceType.SERVICE, namespace, '');
    return serviceList.body.items.map((svc: V1Service) => {
      return this.wrapService(namespace, svc);
    });
  }

  public async read(namespace: NamespaceName, name: string): Promise<Service> {
    const svc = await this.readV1Service(namespace, name);

    if (!svc) {
      return null;
    }

    return this.wrapService(namespace, svc);
  }

  private async readV1Service(namespace: NamespaceName, name: string): Promise<V1Service> {
    const {response, body} = await this.kubeClient.readNamespacedService(name, namespace.name);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.SERVICE, namespace, name);
    return body as V1Service;
  }

  private wrapService(namespace: NamespaceName, svc: V1Service): Service {
    return new K8ClientService(this.wrapObjectMeta(svc.metadata), svc.spec as ServiceSpec, svc.status as ServiceStatus);
  }

  public async create(
    serviceReference: ServiceReference,
    labels: Record<string, string>,
    servicePort: number,
    podTargetPort: number,
  ): Promise<Service> {
    const v1SvcMetadata = new V1ObjectMeta();
    v1SvcMetadata.name = serviceReference.name.toString();
    v1SvcMetadata.namespace = serviceReference.namespace.toString();
    v1SvcMetadata.labels = labels;

    const v1SvcPort = new V1ServicePort();
    v1SvcPort.port = servicePort;
    v1SvcPort.targetPort = podTargetPort;

    const v1SvcSpec = new V1ServiceSpec();
    v1SvcSpec.ports = [v1SvcPort];

    const v1Svc = new V1Service();
    v1Svc.metadata = v1SvcMetadata;
    v1Svc.spec = v1SvcSpec;

    let result: {response: IncomingMessage; body: V1Service};
    try {
      result = await this.kubeClient.createNamespacedService(serviceReference.namespace.toString(), v1Svc);
    } catch (error) {
      throw new SoloError('Failed to create service', error);
    }

    KubeApiResponse.check(
      result.response,
      ResourceOperation.CREATE,
      ResourceType.SERVICE,
      serviceReference.namespace,
      serviceReference.name.toString(),
    );

    return this.wrapService(serviceReference.namespace, result.body);
  }
}
