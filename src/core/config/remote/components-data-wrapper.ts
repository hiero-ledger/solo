// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../errors/solo-errors.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReferenceName, type ComponentId, type PortForwardConfig} from '../../../types/index.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type ComponentIdsStructure} from '../../../data/schema/model/remote/interfaces/component-ids-structure.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type K8} from '../../../integration/kube/k8.js';
import {type SoloLogger} from '../../logging/solo-logger.js';
import * as constants from '../../constants.js';
import {Templates} from '../../templates.js';

export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
  public constructor(public state: DeploymentStateSchema) {}

  public get componentIds(): ComponentIdsStructure {
    return this.state.componentIds;
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public addNewComponent(
    component: BaseStateSchema,
    type: ComponentTypes,
    isReplace?: boolean,
    skipIncrement: boolean = false,
  ): boolean {
    const componentId: ComponentId = component.metadata.id;

    if (typeof componentId !== 'number') {
      throw new SoloErrors.validation.componentIdRequired(componentId);
    }

    if (!(component instanceof BaseStateSchema)) {
      throw new SoloErrors.internal.dataValidation('component type', 'BaseState', 'unknown');
    }

    let componentAdded: boolean = false;

    const addComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      const existingComponentIndex: number = components.findIndex(
        (existingComponent): boolean => existingComponent.metadata.id === componentId,
      );

      if (existingComponentIndex !== -1) {
        if (isReplace) {
          components[existingComponentIndex] = component;
        }

        return;
      }

      components.push(component);
      componentAdded = true;
    };

    this.applyCallbackToComponentGroup(type, addComponentCallback, componentId);

    if (componentAdded && !skipIncrement) {
      this.componentIds[type] += 1;
    }

    return componentAdded;
  }

  // TODO: Remove once unified method is fully utilized
  public changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void {
    if (!this.state.consensusNodes.some((component): boolean => +component.metadata.id === +componentId)) {
      throw new SoloErrors.validation.componentNotFound(String(componentId), 'consensus-node', 'read');
    }

    const component: ConsensusNodeStateSchema = this.state.consensusNodes.find(
      (component): boolean => +component.metadata.id === +componentId,
    );

    component.metadata.phase = phase;
  }

  public changeComponentPhase(componentId: ComponentId, type: ComponentTypes, phase: DeploymentPhase): void {
    if (typeof componentId !== 'number') {
      throw new SoloErrors.validation.componentIdRequired(componentId);
    }

    const updateComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      const component: BaseStateSchema = components.find((component): boolean => component.metadata.id === componentId);

      if (!component) {
        throw new SoloErrors.validation.componentNotFound(String(componentId), type, 'update');
      }

      component.metadata.phase = phase;
    };

    this.applyCallbackToComponentGroup(type, updateComponentCallback, componentId);
  }

  /** Used to remove specific component from their respective group. */
  public removeComponent(componentId: ComponentId, type: ComponentTypes): void {
    if (typeof componentId !== 'number') {
      throw new SoloErrors.validation.componentIdRequired(componentId);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloErrors.validation.unknownComponentType(type);
    }

    const removeComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      const index: number = components.findIndex((component): boolean => component.metadata.id === componentId);
      if (index === -1) {
        throw new SoloErrors.validation.componentNotFound(String(componentId), type, 'remove');
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
        throw new SoloErrors.validation.componentNotFound(String(componentId), type, 'read');
      }
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentId);

    return component;
  }

  public getComponentByType<T extends BaseStateSchema>(type: ComponentTypes): T[] {
    let components: T[] = [];

    const getComponentsByTypeCallback: (comps: BaseStateSchema[]) => void = (comps): void => {
      components = comps as T[];
    };

    this.applyCallbackToComponentGroup(type, getComponentsByTypeCallback);

    return components;
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
      throw new SoloErrors.validation.componentNotInRemoteConfig(type, String(id));
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

      case ComponentTypes.Postgres: {
        callback(this.state.postgres);
        break;
      }

      case ComponentTypes.Redis: {
        callback(this.state.redis);
        break;
      }

      default: {
        throw new SoloErrors.validation.unknownComponentType(componentType, String(componentId));
      }
    }
  }

  public getNewComponentId(componentType: ComponentTypes): number {
    return this.componentIds[componentType];
  }

  /**
   * Manages port forwarding for a component, checking if it's already enabled and persisting configuration
   * @param clusterReference The cluster reference to forward to
   * @param podReference The pod reference to forward to
   * @param podPort The port on the pod to forward from
   * @param localPort The local port to forward to (starting port if not available)
   * @param k8Client The Kubernetes client to use for port forwarding
   * @param logger Logger for messages
   * @param componentType The component type for persistence
   * @param label Label for the port forward
   * @param reuse Whether to reuse existing port forward if available
   * @param nodeId Optional node ID for finding component when cluster reference is not available
   * @returns The local port number that was used for port forwarding
   */
  public async managePortForward(
    clusterReference: ClusterReferenceName,
    podReference: PodReference,
    podPort: number,
    localPort: number,
    k8Client: K8,
    logger: SoloLogger,
    componentType: ComponentTypes,
    label: string,
    reuse: boolean = false,
    nodeId?: number,
    persist: boolean = false,
    externalAddress?: string,
  ): Promise<number> {
    // found component by cluster reference or nodeId
    let component: BaseStateSchema;
    if (clusterReference) {
      const schemeComponents: BaseStateSchema[] = this.getComponentsByClusterReference<BaseStateSchema>(
        componentType,
        clusterReference,
      );
      component = schemeComponents[0];
    } else {
      const componentId: ComponentId = Templates.renderComponentIdFromNodeId(nodeId);
      component = this.getComponentById<BaseStateSchema>(componentType, componentId);
    }

    if (component === undefined) {
      // it is possible we are upgrading a chart and previous version has no clusterReference save in configMap
      // so we will not be able to find component by clusterReference
      reuse = true;
      logger.showUser(`Port forward config not found for previous installed ${label}, reusing existing port forward`);
    } else if (component.metadata.portForwardConfigs) {
      for (const portForwardConfig of component.metadata.portForwardConfigs) {
        if (reuse === true && portForwardConfig.podPort === podPort) {
          if (portForwardConfig.localPort === localPort) {
            logger.showUser(`${label} Port forward already enabled at ${portForwardConfig.localPort}`);
            return portForwardConfig.localPort;
          }
          // localPort changed (migration) — kill the old process so portForward() reuse logic
          // does not find it and return the stale port, then remove the stale config.
          logger.showUser(`${label} Port forward migrating from ${portForwardConfig.localPort} to ${localPort}`);
          // eslint-disable-next-line unicorn/no-null
          await k8Client.pods().readByReference(null).stopPortForward(portForwardConfig.localPort);
          component.metadata.portForwardConfigs = component.metadata.portForwardConfigs.filter(
            (c): boolean => !(c.podPort === podPort && c.localPort === portForwardConfig.localPort),
          );
          break;
        }
      }
    }

    // Enable port forwarding
    const portForwardPortNumber: number = await k8Client
      .pods()
      .readByReference(podReference)
      .portForward(localPort, podPort, reuse, persist, externalAddress);

    logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
    logger.addMessageGroupMessage(
      constants.PORT_FORWARDING_MESSAGE_GROUP,
      `${label} port forward enabled on ${externalAddress || constants.LOCAL_HOST}:${portForwardPortNumber}`,
    );

    if (component !== undefined) {
      component.metadata.portForwardConfigs ||= [];

      // Check if this exact podPort and localPort pair already exists
      const existingConfig: PortForwardConfig | undefined = component.metadata.portForwardConfigs.find(
        (config): boolean => config.podPort === podPort && config.localPort === portForwardPortNumber,
      );

      if (existingConfig) {
        logger.info(`port forward config already exists: localPort=${portForwardPortNumber}, podPort=${podPort}`);
      } else {
        logger.info(`add port localPort=${portForwardPortNumber}, podPort=${podPort}`);
        // Save port forward config to component
        component.metadata.portForwardConfigs.push({
          podPort: podPort,
          localPort: portForwardPortNumber,
        });
      }
    }

    return portForwardPortNumber;
  }

  /**
   * Stops port forwarding for a component by removing the configuration and stopping the forward
   * @param clusterReference The cluster reference
   * @param podReference The pod reference
   * @param podPort The port on the pod
   * @param localPort The local port
   * @param k8Client The Kubernetes client to use for stopping port forwarding
   * @param logger Logger for messages
   * @param componentType The component type
   * @param label Label for the port forward
   * @param nodeId Optional node ID for finding component when cluster reference is not available
   */
  public async stopPortForwards(
    clusterReference: ClusterReferenceName,
    podReference: PodReference,
    podPort: number,
    localPort: number,
    k8Client: K8,
    logger: SoloLogger,
    componentType: ComponentTypes,
    label: string,
    nodeId?: number,
  ): Promise<void> {
    // Find component by cluster reference or nodeId
    let component: BaseStateSchema;
    if (clusterReference) {
      const schemeComponents: BaseStateSchema[] = this.getComponentsByClusterReference<BaseStateSchema>(
        componentType,
        clusterReference,
      );
      component = schemeComponents[0];
    } else {
      const componentId: ComponentId = Templates.renderComponentIdFromNodeId(nodeId);
      component = this.getComponentById<BaseStateSchema>(componentType, componentId);
    }

    if (component === undefined || !component.metadata.portForwardConfigs) {
      logger.showUserUnlessOneShot(`No port forward config found for ${label}`);
      return;
    }

    // Find the matching port forward config
    const configIndex: number = component.metadata.portForwardConfigs.findIndex(
      (config): boolean => config.podPort === podPort && config.localPort === localPort,
    );

    if (configIndex === -1) {
      logger.showUser(`Port forward config not found for ${label} with podPort=${podPort}, localPort=${localPort}`);
      return;
    }

    // Stop the port forward - use any pod reference since stopping should work regardless of pod
    // eslint-disable-next-line unicorn/no-null
    await k8Client.pods().readByReference(null).stopPortForward(localPort);

    logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding stopped');
    logger.addMessageGroupMessage(
      constants.PORT_FORWARDING_MESSAGE_GROUP,
      `${label} port forward stopped on localhost:${localPort}`,
    );

    // Remove the config from component metadata
    component.metadata.portForwardConfigs.splice(configIndex, 1);
  }
}
