// SPDX-License-Identifier: Apache-2.0

import {PatchStrategy, type KubernetesObject, type KubernetesObjectApi} from '@kubernetes/client-node';
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

  public async scaleStatefulSet(namespace: string, statefulSetName: string, replicas: number): Promise<void> {
    await this.k8sObjectApi.patch(
      {
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata: {
          namespace,
          name: statefulSetName,
        },
        spec: {
          replicas,
        },
      } as KubernetesObject,
      undefined,
      undefined,
      undefined,
      undefined,
      PatchStrategy.StrategicMergePatch,
    );
  }

  public async scaleDeployment(namespace: string, deploymentName: string, replicas: number): Promise<void> {
    await this.k8sObjectApi.patch(
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          namespace,
          name: deploymentName,
        },
        spec: {
          replicas,
        },
      } as KubernetesObject,
      undefined,
      undefined,
      undefined,
      undefined,
      PatchStrategy.StrategicMergePatch,
    );
  }

  public async scaleDeployments(namespace: string, labelSelector: string, replicas: number): Promise<number> {
    const listResponse: unknown = await this.k8sObjectApi.list(
      'apps/v1',
      'Deployment',
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );
    const deployments: KubernetesObject[] = (
      (listResponse as {body?: {items?: KubernetesObject[]}}).body?.items || []
    ).filter((item: KubernetesObject): boolean => !!item.metadata?.name);

    for (const deployment of deployments) {
      await this.k8sObjectApi.patch(
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            namespace,
            name: deployment.metadata?.name,
          },
          spec: {
            replicas,
          },
        } as KubernetesObject,
        undefined,
        undefined,
        undefined,
        undefined,
        PatchStrategy.StrategicMergePatch,
      );
    }

    return deployments.length;
  }
}
