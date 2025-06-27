// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReferenceName, type ComponentId} from '../../../types/index.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type ComponentIdsStructure} from '../../../data/schema/model/remote/interfaces/components-ids-structure.js';

export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
  public constructor(public state: DeploymentStateSchema) {}

  public get componentIds(): ComponentIdsStructure {
    return this.state.componentIds;
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public addNewComponent(component: BaseStateSchema, type: ComponentTypes): void {
    const componentId: ComponentId = component.metadata.id;

    if (typeof componentId !== 'number') {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!(component instanceof BaseStateSchema)) {
      throw new SoloError('Component must be instance of BaseState', undefined, BaseStateSchema);
    }

    const addComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      if (this.checkComponentExists(components, component)) {
        throw new SoloError('Component exists', undefined, component);
      }
      components.push(component);
    };

    this.applyCallbackToComponentGroup(type, addComponentCallback, componentId);

    // Increment the component id counter for the specified type when adding
    this.componentIds[type] += 1;
  }

  public changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void {
    if (!this.state.consensusNodes.some((component): boolean => +component.metadata.id === +componentId)) {
      throw new SoloError(`Consensus node ${componentId} doesn't exist`);
    }

    const component: ConsensusNodeStateSchema = this.state.consensusNodes.find(
      (component): boolean => +component.metadata.id === +componentId,
    );

    component.metadata.phase = phase;
  }

  /** Used to remove specific component from their respective group. */
  public removeComponent(componentId: ComponentId, type: ComponentTypes): void {
    if (typeof componentId !== 'number') {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const removeComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      const index: number = components.findIndex((component): boolean => component.metadata.id === componentId);
      if (index === -1) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to remove`);
      }

      components.splice(index, 1);
    };

    this.applyCallbackToComponentGroup(type, removeComponentCallback, componentId);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseStateSchema>(type: ComponentTypes, componentId: ComponentId): T {
    let component: T;

    const getComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      component = components.find((component): boolean => component.metadata.id === componentId) as T;

      if (!component) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to read`);
      }
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentId);

    return component;
  }

  public getComponentsByClusterReference<T extends BaseStateSchema>(
    type: ComponentTypes,
    clusterReference: ClusterReferenceName,
  ): T[] {
    let filteredComponents: T[] = [];

    const getComponentsByClusterReferenceCallback: (components: T[]) => void = (components): void => {
      filteredComponents = components.filter((component): boolean => component.metadata.cluster === clusterReference);
    };

    this.applyCallbackToComponentGroup(type, getComponentsByClusterReferenceCallback);

    return filteredComponents;
  }

  public getComponentById<T extends BaseStateSchema>(type: ComponentTypes, id: number): T {
    let filteredComponent: T;

    const getComponentByIdCallback: (components: T[]) => void = (components): void => {
      filteredComponent = components.find((component): boolean => +component.metadata.id === +id);
    };

    this.applyCallbackToComponentGroup(type, getComponentByIdCallback);

    if (!filteredComponent) {
      throw new SoloError(`Component of type ${type} with id ${id} was not found in remote config`);
    }

    return filteredComponent;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    componentType: ComponentTypes,
    callback: (components: BaseStateSchema[]) => void,
    componentId?: ComponentId,
  ): void {
    switch (componentType) {
      case ComponentTypes.RelayNodes: {
        callback(this.state.relayNodes);
        break;
      }

      case ComponentTypes.HaProxy: {
        callback(this.state.haProxies);
        break;
      }

      case ComponentTypes.MirrorNode: {
        callback(this.state.mirrorNodes);
        break;
      }

      case ComponentTypes.EnvoyProxy: {
        callback(this.state.envoyProxies);
        break;
      }

      case ComponentTypes.ConsensusNode: {
        callback(this.state.consensusNodes);
        break;
      }

      case ComponentTypes.Explorer: {
        callback(this.state.explorers);
        break;
      }

      case ComponentTypes.BlockNode: {
        callback(this.state.blockNodes);
        break;
      }

      default: {
        throw new SoloError(`Unknown component type ${componentType}, component id: ${componentId}`);
      }
    }
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: BaseStateSchema[], newComponent: BaseStateSchema): boolean {
    return components.some((component): boolean => component.metadata.id === newComponent.metadata.id);
  }

  public getNewComponentId(componentType: ComponentTypes): number {
    return this.componentIds[componentType];
  }
}
