// SPDX-License-Identifier: Apache-2.0

import {type BaseState} from '../../../../data/schema/model/remote/state/base-state.js';
import {type ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type DeploymentState} from '../../../../data/schema/model/remote/deployment-state.js';
import {type ClusterReference, type ComponentId} from '../../../../types/index.js';

export interface ComponentsDataWrapperApi {
  state: DeploymentState;

  addNewComponent(component: BaseState, type: ComponentTypes): void;

  changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void;

  removeComponent(componentId: ComponentId, type: ComponentTypes): void;

  getComponent<T extends BaseState>(type: ComponentTypes, componentId: ComponentId): T;

  getComponentsByClusterReference<T extends BaseState>(type: ComponentTypes, clusterReference: ClusterReference): T[];

  getComponentById<T extends BaseState>(type: ComponentTypes, id: number): T;

  getNewComponentId(componentType: ComponentTypes): number;
}
