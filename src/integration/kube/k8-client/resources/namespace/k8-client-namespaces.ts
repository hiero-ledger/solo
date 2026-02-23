// SPDX-License-Identifier: Apache-2.0

import {type Namespaces} from '../../../../../types/namespace/namespaces.js';
import {type CoreV1Api, type V1Namespace, type V1NamespaceList} from '@kubernetes/client-node';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';

export class K8ClientNamespaces implements Namespaces {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async create(namespace: NamespaceName): Promise<boolean> {
    const body: V1Namespace = {
      metadata: {
        name: namespace.name,
      },
    };

    await this.kubeClient.createNamespace({body});
    return true;
  }

  public async delete(namespace: NamespaceName): Promise<boolean> {
    try {
      await this.kubeClient.deleteNamespace({name: namespace.name});
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

    throw new SoloError('incorrect response received from kubernetes API. Unable to list namespaces');
  }
}
