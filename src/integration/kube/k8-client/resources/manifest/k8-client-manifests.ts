// SPDX-License-Identifier: Apache-2.0

import {type KubernetesObject, type KubernetesObjectApi, PatchStrategy} from '@kubernetes/client-node';
import yaml from 'yaml';
import fs from 'node:fs';
import {type Manifests} from '../../../resources/manifest/manifests.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';

export class K8ClientManifests implements Manifests {
  private static readonly PATCH_MAX_ATTEMPTS: number = 5;
  private static readonly PATCH_RETRY_DELAY: Duration = Duration.ofSeconds(2);
  private static readonly TRANSIENT_CONNECTION_ERROR: RegExp =
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket disconnected|socket hang up|HTTP-Code: (403|404|503)\b/i;

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

  /**
   * Patch an existing Kubernetes object (including custom resources) using a merge patch.
   * @param spec - a partial Kubernetes object with apiVersion, kind, metadata.name, metadata.namespace, and the fields to patch
   */
  public async patchObject(spec: object): Promise<void> {
    // A merge patch is idempotent, so it is safe to retry when the API server drops the connection
    // (e.g. while it restarts right after a CRD install).
    for (let attempt: number = 1; ; attempt++) {
      try {
        await this.k8sObjectApi.patch(
          spec as KubernetesObject,
          undefined,
          undefined,
          undefined,
          undefined,
          PatchStrategy.MergePatch,
        );
        return;
      } catch (error) {
        const message: string =
          error instanceof Error ? `${error.message} ${(error as {code?: string}).code ?? ''}` : '';
        if (
          attempt >= K8ClientManifests.PATCH_MAX_ATTEMPTS ||
          !K8ClientManifests.TRANSIENT_CONNECTION_ERROR.test(message)
        ) {
          throw error;
        }
        await sleep(K8ClientManifests.PATCH_RETRY_DELAY);
      }
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
}
