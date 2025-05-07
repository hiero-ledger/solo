// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {SoloError} from '../../errors/solo-error.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {BaseState} from '../../../data/schema/model/remote/state/base-state.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type RemoteConfigRuntimeState} from '../../../business/runtime-state/remote-config-runtime-state.js';
import {type DeploymentState} from '../../../data/schema/model/remote/deployment-state.js';
import {type ClusterReference, type ComponentId} from '../../../types/index.js';

export class ComponentsDataWrapper {
  public readonly state: DeploymentState;

  private constructor(
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfigRuntimeState?: RemoteConfigRuntimeState,
  ) {
    this.remoteConfigRuntimeState = patchInject(
      remoteConfigRuntimeState,
      InjectTokens.RemoteConfigRuntimeState,
      this.constructor.name,
    );

    this.state = this.remoteConfigRuntimeState.state;
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public addNewComponent(component: BaseState, type: ComponentTypes): void {
    const componentId: ComponentId = component.metadata.id;

    if (typeof componentId !== 'number' || componentId < 0) {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!(component instanceof BaseState)) {
      throw new SoloError('Component must be instance of BaseState', undefined, BaseState);
    }

    const addComponentCallback: (components: BaseState[]) => void = components => {
      if (this.checkComponentExists(components, component)) {
        throw new SoloError('Component exists', undefined, component);
      }
      components[componentId] = component;
    };

    this.applyCallbackToComponentGroup(type, addComponentCallback, componentId);
  }

  public changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void {
    if (!this.state.consensusNodes[componentId]) {
      throw new SoloError(`Consensus node ${componentId} doesn't exist`);
    }

    this.state.consensusNodes[componentId].metadata.phase = phase;
  }

  /** Used to remove specific component from their respective group. */
  public removeComponent(componentId: ComponentId, type: ComponentTypes): void {
    if (typeof componentId !== 'number' || componentId < 0) {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const removeComponentCallback: (components: BaseState[]) => void = components => {
      const index: number = components.findIndex(component => component.metadata.id === componentId);
      if (index === -1) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to remove`);
      }

      components.splice(index, 1);
    };

    this.applyCallbackToComponentGroup(type, removeComponentCallback, componentId);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseState>(type: ComponentTypes, componentId: ComponentId): T {
    let component: T;

    const getComponentCallback: (components: BaseState[]) => void = components => {
      component = components.find(component => component.metadata.id === componentId) as T;

      if (!component) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to read`);
      }
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentId);

    return component;
  }

  public getComponentsByClusterReference<T extends BaseState>(
    type: ComponentTypes,
    clusterReference: ClusterReference,
  ): T[] {
    let filteredComponents: T[] = [];

    const getComponentsByClusterReferenceCallback: (components: T[]) => void = components => {
      filteredComponents = components.filter(component => component.metadata.cluster === clusterReference);
    };

    this.applyCallbackToComponentGroup(type, getComponentsByClusterReferenceCallback);

    return filteredComponents;
  }

  public getComponentById<T extends BaseState>(type: ComponentTypes, id: number): T {
    let filteredComponent: T;

    const getComponentByIdCallback: (components: T[]) => void = components => {
      filteredComponent = components.find(component => +component.metadata.id === id);
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
    callback: (components: BaseState[]) => void,
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

      case ComponentTypes.Explorers: {
        callback(this.state.explorers);
        break;
      }

      default: {
        throw new SoloError(`Unknown component type ${componentType}, component id: ${componentId}`);
      }
    }
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: BaseState[], newComponent: BaseState): boolean {
    return components.some((component): boolean => component.metadata.id === newComponent.metadata.id);
  }

  /**
   * Checks all existing components of specified type and gives you a new unique index
   */
  public getNewComponentId(componentType: ComponentTypes): number {
    let newComponentId: number = 0;

    const calculateNewComponentIndexCallback: (components: BaseState[]) => void = components => {
      const componentIds: ComponentId[] = components.map(component => component.metadata.id);

      for (const componentId of componentIds) {
        if (newComponentId <= +componentId) {
          newComponentId = +componentId + 1;
        }
      }
    };

    this.applyCallbackToComponentGroup(componentType, calculateNewComponentIndexCallback);

    return newComponentId;
  }
}
