// SPDX-License-Identifier: Apache-2.0

import {type BaseStateSchema} from '../../../../data/schema/model/remote/state/base-state-schema.js';
import {type ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReferenceName, type ComponentId} from '../../../../types/index.js';
import {type DeploymentStateSchema} from '../../../../data/schema/model/remote/deployment-state-schema.js';

export interface ComponentsDataWrapperApi {
  state: DeploymentStateSchema;

  addNewComponent(component: BaseStateSchema, type: ComponentTypes, isReplace?: boolean): void;

  changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void;

  removeComponent(componentId: ComponentId, type: ComponentTypes): void;

  getComponent<T extends BaseStateSchema>(type: ComponentTypes, componentId: ComponentId): T;

  getComponentByType<T extends BaseStateSchema>(type: ComponentTypes): T[];

  getComponentsByClusterReference<T extends BaseStateSchema>(
    type: ComponentTypes,
    clusterReference: ClusterReferenceName,
  ): T[];

  getComponentById<T extends BaseStateSchema>(type: ComponentTypes, id: number): T;

  getNewComponentId(componentType: ComponentTypes): number;
}
