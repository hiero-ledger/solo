// SPDX-License-Identifier: Apache-2.0

import {type KubernetesObject, type KubernetesObjectApi} from '@kubernetes/client-node';
import yaml from 'yaml';
import fs from 'node:fs';
import {type Manifests} from '../../../resources/manifest/manifests.js';

export class K8ClientManifests implements Manifests {
  public constructor(private readonly k8sObjectApi: KubernetesObjectApi) {}

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
