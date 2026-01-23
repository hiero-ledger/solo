// SPDX-License-Identifier: Apache-2.0

import {type Ingresses} from '../../../resources/ingress/ingresses.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type V1IngressList, type NetworkingV1Api, type V1Ingress} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {ResourceReadError, ResourceUpdateError} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';

export class K8ClientIngresses implements Ingresses {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: NetworkingV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async listForAllNamespaces(): Promise<string[]> {
    let result: V1IngressList;
    try {
      result = await this.networkingApi.listIngressForAllNamespaces();
    } catch (error) {
      throw new ResourceReadError(ResourceType.INGRESS, undefined, '', error);
    }

    if (result?.items) {
      const ingressNames: string[] = [];
      for (const ingress of result.items) {
        ingressNames.push(ingress.metadata?.name ?? '');
      }
      return ingressNames;
    } else {
      return [];
    }
  }

  public async update(namespace: NamespaceName, name: string, patch: object): Promise<void> {
    const ingresses: string[] = [];
    // find the ingresses that match the specified name
    await this.networkingApi
      .listIngressForAllNamespaces()
      .then((response): void => {
        for (const ingress of response.items) {
          const currentIngressName: string = ingress.metadata.name;
          if (currentIngressName.includes(name)) {
            ingresses.push(currentIngressName);
          }
        }
      })
      .catch((error): never => {
        throw new SoloError(`Error listing Ingresses: ${error}`);
      });

    for (const ingressName of ingresses) {
      let result: V1Ingress;
      try {
        result = await this.networkingApi.patchNamespacedIngress({
          name: ingressName,
          namespace: namespace.name,
          body: patch,
        });

        this.logger.info(`Patched Ingress ${ingressName} in namespace ${namespace}, patch: ${JSON.stringify(patch)}`);
      } catch (error) {
        throw new ResourceUpdateError(ResourceType.INGRESS, namespace, ingressName, error);
      }

      if (!result) {
        throw new SoloError(
          `Failed to update Ingress ${ingressName} in namespace ${namespace}, received no ingress in response to patch`,
        );
      }
    }
  }
}
