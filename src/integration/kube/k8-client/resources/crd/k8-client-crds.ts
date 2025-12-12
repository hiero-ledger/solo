// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type ApiextensionsV1Api, type V1CustomResourceDefinition} from '@kubernetes/client-node';
import {type Crds} from '../../../resources/crd/crds.js';
import {type IncomingMessage} from 'node:http';

export class K8ClientCrds implements Crds {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: ApiextensionsV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async ifExists(crdName: string): Promise<boolean> {
    try {
      const response: {response: IncomingMessage; body: V1CustomResourceDefinition} =
        await this.networkingApi.readCustomResourceDefinition(crdName);
      this.logger.debug(`CRD ${crdName} exists, response:`, response);
      return true;
    } catch (error) {
      if (error.response && error.response.statusCode === 404) {
        this.logger.error(`CRD ${crdName} does not exist.`);
        return false;
      } else {
        this.logger.error('Error checking CRD:', error);
        throw error; // Re-throw unexpected errors
      }
    }
  }
}
