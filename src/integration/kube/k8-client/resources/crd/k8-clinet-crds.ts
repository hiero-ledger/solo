// SPDX-License-Identifier: Apache-2.0

import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type ApiextensionsV1Api, type KubernetesObject, type KubernetesObjectApi} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {type Crds} from '../../../resources/crd/crds.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import yaml from 'yaml';
import fs from 'node:fs';

export class K8ClientCRDs implements Crds {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly networkingApi: ApiextensionsV1Api,
    private readonly k8sObjectApi: KubernetesObjectApi,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async ifExists(crdName: string): Promise<boolean> {
    try {
      const response = await this.networkingApi.readCustomResourceDefinition(crdName);
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

  /**
   * Apply a CRD manifest file (like `kubectl apply -f <file>`).
   * Uses server-side apply (Content-Type: application/apply-patch+yaml)
   * via KubernetesObjectApi.
   */
  public async applyManifest(filePath: string): Promise<void> {
    const yamlText: string = fs.readFileSync(filePath, 'utf8');

    const documents: KubernetesObject[] = yaml
      .parseAllDocuments(yamlText)
      .map((document: {toJSON: () => KubernetesObject}): KubernetesObject => document.toJSON() as KubernetesObject);

    for (const document of documents) {
      if (!document || !document.metadata) {
        continue;
      }

      await this.k8sObjectApi.create(document);
    }
  }
}
