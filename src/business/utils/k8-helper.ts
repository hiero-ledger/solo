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
import {type ObjectMeta} from '../../integration/kube/resources/object-meta.js';
import {SOLO_CREATED_BY_LABEL, SOLO_CREATED_BY_VALUE} from '../../core/constants.js';

export class K8Helper {
  private k8: K8;
  private static readonly TERMINAL_POD_PHASES: ReadonlySet<string> = new Set(['Succeeded', 'Failed']);

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
      .then((pods): Pod => this.selectPodWithReference(pods));
  }

  public async getConsensusNodePodReference(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<PodReference> {
    return await this.getConsensusNodePod(namespace, nodeAlias).then((pod): PodReference => pod.podReference);
  }

  public async getBlockNodePod(namespace: NamespaceName, id: ComponentId): Promise<Pod> {
    return this.k8
      .pods()
      .list(namespace, Templates.renderBlockNodeLabels(id))
      .then((pods: Pod[]): Pod => this.selectPodWithReference(pods));
  }

  private selectPodWithReference(pods: Pod[]): Pod {
    const pod: Pod | undefined =
      pods.find(
        (candidate: Pod): boolean =>
          Boolean(candidate?.podReference) &&
          !candidate?.deletionTimestamp &&
          !K8Helper.TERMINAL_POD_PHASES.has(candidate?.phase ?? ''),
      ) ??
      pods.find((candidate: Pod): boolean => Boolean(candidate?.podReference) && !candidate?.deletionTimestamp) ??
      pods.find((candidate: Pod): boolean => Boolean(candidate?.podReference)) ??
      pods[0];

    if (!pod?.podReference) {
      throw new Error('No pod with a valid pod reference found');
    }
    return pod;
  }

  public async isNamespaceOwnedBySolo(namespace: NamespaceName): Promise<boolean> {
    const namespaceObject: ObjectMeta = await this.k8.namespaces().get(namespace);
    const labels: Record<string, string> = namespaceObject?.labels;

    return labels.hasOwnProperty(SOLO_CREATED_BY_LABEL) && labels[SOLO_CREATED_BY_LABEL] === SOLO_CREATED_BY_VALUE;
  }
}
