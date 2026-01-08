// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type ApiextensionsV1Api, type V1CustomResourceDefinition} from '@kubernetes/client-node';
import {type CustomResourceDefinitions} from '../../../resources/crd/custom-resource-definitions.js';

export class K8ClientCustomResourceDefinitions implements CustomResourceDefinitions {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: ApiextensionsV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async ifExists(customResourceDefinitionName: string): Promise<boolean> {
    try {
      const response: V1CustomResourceDefinition = await this.networkingApi.readCustomResourceDefinition({
        name: customResourceDefinitionName,
      });
      this.logger.debug(`CRD ${customResourceDefinitionName} exists, response:`, response);
      return true;
    } catch (error) {
      if (error.response && error.response.statusCode === 404) {
        this.logger.error(`CRD ${customResourceDefinitionName} does not exist.`);
        return false;
      } else {
        this.logger.error('Error checking CRD:', error);
        throw error; // Re-throw unexpected errors
      }
    }
  }
}
