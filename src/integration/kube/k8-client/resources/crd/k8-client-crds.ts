// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type ApiextensionsV1Api, type V1CustomResourceDefinition} from '@kubernetes/client-node';
import {type Crds} from '../../../resources/crd/crds.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';

export class K8ClientCrds implements Crds {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: ApiextensionsV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async ifExists(crdName: string): Promise<boolean> {
    let response: V1CustomResourceDefinition;
    try {
      response = await this.networkingApi.readCustomResourceDefinition({
        name: crdName,
      });
      this.logger.debug(`CRD ${crdName} exists, response:`, response);
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        this.logger.error(`CRD ${crdName} does not exist.`);
        return false;
      }
      KubeApiResponse.throwError(
        error,
        ResourceOperation.READ,
        ResourceType.CLUSTER_ROLE_DEFINITION,
        undefined,
        crdName,
      );
    }
    return true;
  }
}
