// SPDX-License-Identifier: Apache-2.0

import {type Contexts} from '../../../resources/context/contexts.js';
import {type KubeConfig, CoreV1Api, type V1NamespaceList} from '@kubernetes/client-node';
import {K8ClientApiFactory} from '../../k8-client-api-factory.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';

export class K8ClientContexts implements Contexts {
  public constructor(private readonly kubeConfig: KubeConfig) {}

  public list(): string[] {
    const contexts: string[] = [];

    for (const context of this.kubeConfig.getContexts()) {
      contexts.push(context.name);
    }

    return contexts;
  }

  public readCurrent(): string {
    return this.kubeConfig.getCurrentContext();
  }

  public readCurrentNamespace(): NamespaceName {
    return NamespaceName.of(this.kubeConfig.getContextObject(this.readCurrent())?.namespace);
  }

  public updateCurrent(context: string): void {
    this.kubeConfig.setCurrentContext(context);
  }

  public async testContextConnection(context: string): Promise<boolean> {
    const originalContextName: string = this.readCurrent();
    this.kubeConfig.setCurrentContext(context);

    const temporaryKubeClient: CoreV1Api = K8ClientApiFactory.makeApiClient(this.kubeConfig, CoreV1Api);
    try {
      const result: V1NamespaceList = await temporaryKubeClient.listNamespace();
      if (result?.items) {
        this.kubeConfig.setCurrentContext(originalContextName);
        return true;
      }
    } catch {
      // Do nothing, we will return false at the end of the method
    }
    this.kubeConfig.setCurrentContext(originalContextName);
    return false;
  }
}
