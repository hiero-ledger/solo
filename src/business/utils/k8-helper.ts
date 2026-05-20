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
}
