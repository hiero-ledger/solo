// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ComponentId, type Context} from '../../types/index.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type NodeAlias} from '../../types/aliases.js';
import {type Container} from '../../integration/kube/resources/container/container.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import * as constants from '../../core/constants.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {Templates} from '../../core/templates.js';
import {type PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {type K8} from '../../integration/kube/k8.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {sleep} from '../../core/helpers.js';
import {Duration} from '../../core/time/duration.js';

export class K8Helper {
  private k8: K8;

  public constructor(context: Context, @inject(InjectTokens.K8Factory) k8Factory?: K8Factory) {
    k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.k8 = k8Factory.getK8(context);
  }

  public async getConsensusNodeRootContainer(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Container> {
    return await this.getConsensusNodePodReference(namespace, nodeAlias)
      .then((pod): ContainerReference => ContainerReference.of(pod, constants.ROOT_CONTAINER))
      .then((containerReference): Container => this.k8.containers().readByRef(containerReference));
  }

  public async getConsensusNodePod(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Pod> {
    return await this.k8
      .pods()
      .list(namespace, Templates.renderNodeLabelsFromNodeAlias(nodeAlias))
      .then((pods): Pod => pods[0]);
  }

  public async getConsensusNodePodReference(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<PodReference> {
    return await this.getConsensusNodePod(namespace, nodeAlias).then((pod): PodReference => pod.podReference);
  }

  public async getBlockNodePod(namespace: NamespaceName, id: ComponentId): Promise<Pod> {
    return this.k8
      .pods()
      .list(namespace, Templates.renderBlockNodeLabels(id))
      .then((pods: Pod[]): Pod => pods[0]);
  }

  /**
   * Wait until the root-container sidecar in a consensus-node pod is accessible.
   * Polls by attempting a simple exec (`pwd`) in the container.
   *
   * @param namespace - the namespace containing the pod
   * @param nodeAlias - the node alias (e.g. "node1")
   * @param maxAttempts - maximum number of polling attempts (default 30)
   * @param delay - delay between attempts in milliseconds (default 2000)
   * @returns the accessible Container handle
   */
  public async waitForRootContainer(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    maxAttempts: number = 30,
    delay: number = 2000,
  ): Promise<Container> {
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const container: Container = await this.getConsensusNodeRootContainer(namespace, nodeAlias);
        await container.execContainer('pwd');
        return container;
      } catch (error) {
        const message: string = error instanceof Error ? error.message : String(error);
        const isTransient: boolean =
          message.includes('container not found') || message.includes('not found') || message.includes('Invalid pod');
        if (!isTransient) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw new SoloError(
            `root-container for ${nodeAlias} did not become ready after ${maxAttempts} attempts`,
            error instanceof Error ? error : undefined,
          );
        }
        await sleep(Duration.ofMillis(delay));
      }
    }

    throw new SoloError(`root-container for ${nodeAlias} did not become ready after ${maxAttempts} attempts`);
  }
}
