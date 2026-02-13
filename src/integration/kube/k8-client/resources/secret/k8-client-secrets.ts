// SPDX-License-Identifier: Apache-2.0

import {type Secrets} from '../../../resources/secret/secrets.js';
import {type CoreV1Api, V1ObjectMeta, V1Secret, type V1SecretList} from '@kubernetes/client-node';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type Optional} from '../../../../../types/index.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {
  ResourceCreateError,
  ResourceNotFoundError,
  ResourceReplaceError,
} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {Duration} from '../../../../../core/time/duration.js';
import {type SecretType} from '../../../resources/secret/secret-type.js';
import {type Secret} from '../../../resources/secret/secret.js';

export class K8ClientSecrets implements Secrets {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async create(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, secretType, data, labels, false, true);
  }

  public async createOrReplace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, secretType, data, labels, false, false);
  }

  public async delete(namespace: NamespaceName, name: string): Promise<boolean> {
    await this.kubeClient.deleteNamespacedSecret({name, namespace: namespace.name});
    return true;
  }

  public async replace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return this.createOrReplaceWithForce(namespace, name, secretType, data, labels, true);
  }

  public async read(namespace: NamespaceName, name: string): Promise<Secret> {
    const {response, body} = await this.kubeClient
      .readNamespacedSecret({name, namespace: namespace.name})
      .catch((error): any => error);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.SECRET, namespace, name);
    return {
      name: body.metadata!.name as string,
      labels: body.metadata!.labels as Record<string, string>,
      namespace: body.metadata!.namespace as string,
      type: body.type as string,
      data: body.data as Record<string, string>,
    };
  }

  public async list(namespace: NamespaceName, labels?: string[]): Promise<Array<Secret>> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const secretList: V1SecretList = await this.kubeClient.listNamespacedSecret({
      namespace: namespace.toString(),
      labelSelector,
      timeoutSeconds: Duration.ofMinutes(5).toMillis(),
    });

    return secretList.items.map((secret: V1Secret): Secret => {
      return {
        name: secret.metadata!.name as string,
        labels: secret.metadata!.labels as Record<string, string>,
        namespace: secret.metadata!.namespace as string,
        type: secret.type as string,
        data: secret.data as Record<string, string>,
      };
    });
  }

  public async exists(namespace: NamespaceName, name: string): Promise<boolean> {
    try {
      const cm: Secret = await this.read(namespace, name);
      return !!cm;
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return false;
      } else {
        throw error;
      }
    }
  }

  private async createOrReplaceWithForce(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    forceReplace?: boolean,
    forceCreate?: boolean,
  ): Promise<boolean> {
    const replace: boolean = await this.shouldReplace(namespace, name, forceReplace, forceCreate);
    const v1Secret: V1Secret = new V1Secret();
    v1Secret.apiVersion = 'v1';
    v1Secret.kind = 'Secret';
    v1Secret.type = secretType;
    v1Secret.data = data;
    v1Secret.metadata = new V1ObjectMeta();
    v1Secret.metadata.name = name;
    v1Secret.metadata.labels = labels;

    try {
      await (replace
        ? this.kubeClient.replaceNamespacedSecret({name, namespace: namespace.name, body: v1Secret})
        : this.kubeClient.createNamespacedSecret({namespace: namespace.name, body: v1Secret}));
      return true;
    } catch (error) {
      throw replace
        ? new ResourceReplaceError(ResourceType.SECRET, namespace, name, error)
        : new ResourceCreateError(ResourceType.SECRET, namespace, name, error);
    }
  }

  private async shouldReplace(
    namespace: NamespaceName,
    name: string,
    forceReplace?: boolean,
    forceCreate?: boolean,
  ): Promise<boolean> {
    if (forceReplace && !forceCreate) {
      return true;
    }

    if (forceCreate) {
      return false;
    }

    return await this.exists(namespace, name);
  }
}
