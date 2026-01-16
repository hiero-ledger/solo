// SPDX-License-Identifier: Apache-2.0

import {type Helpers} from '../../../resources/helpers/helpers.js';
import {ContainerReference} from '../../../resources/container/container-reference.js';
import {Templates} from '../../../../../core/templates.js';
import * as constants from '../../../../../core/constants.js';
import {type PodReference} from '../../../resources/pod/pod-reference.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type NodeAlias} from '../../../../../types/aliases.js';
import {type Container} from '../../../resources/container/container.js';
import {type Pods} from '../../../resources/pod/pods.js';
import {type Containers} from '../../../resources/container/containers.js';
import {type Pod} from '../../../resources/pod/pod.js';

export class K8ClientHelpers implements Helpers {
  public constructor(
    private readonly pods: Pods,
    private readonly containers: Containers,
  ) {}

  public async getConsensusNodeRootContainer(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Container> {
    return await this.getConsensusNodePodReference(namespace, nodeAlias)
      .then((pod): ContainerReference => ContainerReference.of(pod, constants.ROOT_CONTAINER))
      .then((containerReference): Container => this.containers.readByRef(containerReference));
  }

  public async getConsensusNodePod(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Pod> {
    return await this.pods
      .list(namespace, Templates.renderNodeLabelsFromNodeAlias(nodeAlias))
      .then((pods): Pod => pods[0]);
  }

  public async getConsensusNodePodReference(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<PodReference> {
    return await this.getConsensusNodePod(namespace, nodeAlias).then((pod): PodReference => pod.podReference);
  }
}
