// SPDX-License-Identifier: Apache-2.0

import {type Namespaces} from '../../../../../types/namespace/namespaces.js';
import {type CoreV1Api, type V1Namespace, type V1NamespaceList} from '@kubernetes/client-node';
import {type ObjectMeta} from '../../../resources/object-meta.js';
import {KubeApiInvalidResponseError} from '../../../errors/kube-api-invalid-response-error.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';

export class K8ClientNamespaces implements Namespaces {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async create(namespace: NamespaceName, labels?: Record<string, string>): Promise<boolean> {
    const body: V1Namespace = {
      metadata: {
        name: namespace.name,
        labels,
      },
    };

    await this.kubeClient.createNamespace({body});
    return true;
  }

  public async get(namespace: NamespaceName): Promise<ObjectMeta> {
    const response: V1Namespace = await this.kubeClient.readNamespace({name: namespace.name});
    return {
      name: response.metadata?.name ?? namespace.name,
      labels: response.metadata?.labels,
      annotations: response.metadata?.annotations,
      uid: response.metadata?.uid,
    };
  }

  public async delete(namespace: NamespaceName, gracePeriodSeconds?: number): Promise<boolean> {
    try {
      await this.kubeClient.deleteNamespace(
        gracePeriodSeconds === undefined
          ? {name: namespace.name}
          : {name: namespace.name, gracePeriodSeconds, propagationPolicy: 'Background'},
      );
      try {
        let namespaceExists: boolean = true;
        while (namespaceExists) {
          const response: V1Namespace = await this.kubeClient.readNamespace({name: namespace.name});

          if (response?.metadata?.deletionTimestamp) {
            await sleep(Duration.ofSeconds(1));
          } else {
            namespaceExists = false;
          }
        }
      } catch {
        // The namespace has been deleted
      }

      return true;
    } catch {
      return false;
    }
  }

  public async has(namespace: NamespaceName): Promise<boolean> {
    const namespaces: NamespaceName[] = await this.list();
    return namespaces.some((namespaces): boolean => namespaces.equals(namespace));
  }

  public async list(): Promise<NamespaceName[]> {
    const response: V1NamespaceList = await this.kubeClient.listNamespace();
    if (response && response.items) {
      const namespaces: NamespaceName[] = [];
      for (const item of response.items) {
        namespaces.push(NamespaceName.of(item.metadata!.name));
      }

      return namespaces;
    }

    throw new KubeApiInvalidResponseError();
  }
}
