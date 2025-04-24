// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {BaseComponent} from './components/base-component.js';
import {RelayComponent} from './components/relay-component.js';
import {HaProxyComponent} from './components/ha-proxy-component.js';
import {BlockNodeComponent} from './components/block-node-component.js';
import {MirrorNodeComponent} from './components/mirror-node-component.js';
import {EnvoyProxyComponent} from './components/envoy-proxy-component.js';
import {ConsensusNodeComponent} from './components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from './components/mirror-node-explorer-component.js';
import {type ClusterReference, type ComponentName} from './types.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {type BaseComponentStruct} from './components/interfaces/base-component-struct.js';
import {type RelayComponentStruct} from './components/interfaces/relay-component-struct.js';
import {type ConsensusNodeComponentStruct} from './components/interfaces/consensus-node-component-struct.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type ComponentsDataStruct} from './interfaces/components-data-struct.js';

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
  private constructor(
    public readonly relays: Record<ComponentName, RelayComponent> = {},
    public readonly haProxies: Record<ComponentName, HaProxyComponent> = {},
    public readonly mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {},
    public readonly envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {},
    public readonly consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {},
    public readonly mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {},
    public readonly blockNodes: Record<ComponentName, BlockNodeComponent> = {},
  ) {
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public add(component: BaseComponent): void {
    const self = this;

    const serviceName = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', null, BaseComponent);
    }

    function addComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (self.exists(components, component)) {
        throw new SoloError('Component exists', null, component.toObject());
      }
      components[serviceName] = component;
    }

    self.applyCallbackToComponentGroup(component.type, serviceName, addComponentCallback);
  }

  /** Used to edit an existing component from their respective group. */
  public edit(component: BaseComponent): void {
    const serviceName: ComponentName = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }
    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', null, BaseComponent);
    }

    function editComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (!components[serviceName]) {
        throw new SoloError(`Component doesn't exist, name: ${serviceName}`, null, {component});
      }
      components[serviceName] = component;
    }

    this.applyCallbackToComponentGroup(component.type, editComponentCallback, serviceName);
  }

  /** Used to remove specific component from their respective group. */
  public remove(serviceName: ComponentName, type: ComponentTypes): void {
    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }
    if (!Object.values(ComponentTypes).includes(type)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    function deleteComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (!components[serviceName]) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to remove`);
      }
      delete components[serviceName];
    }

    this.applyCallbackToComponentGroup(type, deleteComponentCallback, serviceName);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseComponent>(type: ComponentTypes, componentName: ComponentName): T {
    let component: T;

    const getComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = components => {
      if (!components[componentName]) {
        throw new SoloError(`Component ${componentName} of type ${type} not found while attempting to read`);
      }
      component = components[componentName] as T;
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentName);

    return component;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    componentType: ComponentTypes,
    callback: (components: Record<ComponentName, BaseComponent>) => void,
    componentName?: ComponentName,
  ): void {
    switch (componentType) {
      case ComponentTypes.Relay: {
        callback(this.relays);
        break;
      }

      case ComponentTypes.HaProxy: {
        callback(this.haProxies);
        break;
      }

      case ComponentTypes.MirrorNode: {
        callback(this.mirrorNodes);
        break;
      }

      case ComponentTypes.EnvoyProxy: {
        callback(this.envoyProxies);
        break;
      }

      case ComponentTypes.ConsensusNode: {
        callback(this.consensusNodes);
        break;
      }

      case ComponentTypes.MirrorNodeExplorer: {
        callback(this.mirrorNodeExplorers);
        break;
      }

      case ComponentTypes.BlockNode: {
        callback(this.blockNodes);
        break;
      }

      default: {
        throw new SoloError(`Unknown component type ${componentType}, component name: ${componentName}`);
      }
    }

    this.validate();
  }

  /**
   * Handles creating instance of the class from plain object.
   *
   * @param components - component groups distinguished by their type.
   */
  public static fromObject(components: ComponentsDataStruct): ComponentsDataWrapper {
    const relays: Record<ComponentName, RelayComponent> = {};
    const haProxies: Record<ComponentName, HaProxyComponent> = {};
    const mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {};
    const envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {};
    const consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {};
    const mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {};
    const blockNodes: Record<ComponentName, BlockNodeComponent> = {};

    for (const [componentType, subComponents] of Object.entries(components)) {
      switch (componentType) {
        case ComponentTypes.Relay: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            relays[componentName] = RelayComponent.fromObject(component as RelayComponentStruct);
          }
          break;
        }

        case ComponentTypes.HaProxy: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            haProxies[componentName] = HaProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.MirrorNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            mirrorNodes[componentName] = MirrorNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.EnvoyProxy: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            envoyProxies[componentName] = EnvoyProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.ConsensusNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            consensusNodes[componentName] = ConsensusNodeComponent.fromObject(
              component as ConsensusNodeComponentStruct,
            );
          }
          break;
        }

        case ComponentTypes.MirrorNodeExplorer: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[componentName] = MirrorNodeExplorerComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.BlockNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            blockNodes[componentName] = BlockNodeComponent.fromObject(component);
          }
          break;
        }

        default: {
          throw new SoloError(`Unknown component type ${componentType}`);
        }
      }
    }

    return new ComponentsDataWrapper(
      relays,
      haProxies,
      mirrorNodes,
      envoyProxies,
      consensusNodes,
      mirrorNodeExplorers,
      blockNodes,
    );
  }

  /** Used to create an empty instance used to keep the constructor private */
  public static initializeEmpty(): ComponentsDataWrapper {
    return new ComponentsDataWrapper();
  }

  public static initializeWithNodes(
    nodeAliases: NodeAliases,
    clusterReference: ClusterReference,
    namespace: NamespaceNameAsString,
  ): ComponentsDataWrapper {
    const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> = {};

    for (const nodeAlias of nodeAliases) {
      consensusNodeComponents[nodeAlias] = new ConsensusNodeComponent(
        nodeAlias,
        clusterReference,
        namespace,
        ConsensusNodeStates.NON_DEPLOYED,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      );
    }

    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents, undefined);
  }

  /** checks if component exists in the respective group */
  private exists(components: Record<ComponentName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some(component => BaseComponent.compare(component, newComponent));
  }

  public validate(): void {
    function testComponentsObject(components: Record<ComponentName, BaseComponent>, expectedInstance: any): void {
      for (const [name, component] of Object.entries(components)) {
        if (!name || typeof name !== 'string') {
          throw new SoloError(`Invalid component service name ${{[name]: component?.constructor?.name}}`);
        }

        if (!(component instanceof expectedInstance)) {
          throw new SoloError(
            `Invalid component type, service name: ${name}, ` +
              `expected ${expectedInstance?.name}, actual: ${component?.constructor?.name}`,
            null,
            {component},
          );
        }
      }
    }

    testComponentsObject(this.relays, RelayComponent);
    testComponentsObject(this.haProxies, HaProxyComponent);
    testComponentsObject(this.mirrorNodes, MirrorNodeComponent);
    testComponentsObject(this.envoyProxies, EnvoyProxyComponent);
    testComponentsObject(this.consensusNodes, ConsensusNodeComponent);
    testComponentsObject(this.mirrorNodeExplorers, MirrorNodeExplorerComponent);
  }

  private transformComponentGroupToObject(
    components: Record<ComponentName, BaseComponent>,
  ): Record<ComponentName, BaseComponentStruct> {
    const transformedComponents: Record<ComponentName, BaseComponentStruct> = {};

    for (const [componentName, component] of Object.entries(components)) {
      transformedComponents[componentName] = component.toObject() as BaseComponentStruct;
    }

    return transformedComponents;
  }

  public toObject(): ComponentsDataStruct {
    return {
      [ComponentTypes.Relay]: this.transformComponentGroupToObject(this.relays),
      [ComponentTypes.HaProxy]: this.transformComponentGroupToObject(this.haProxies),
      [ComponentTypes.MirrorNode]: this.transformComponentGroupToObject(this.mirrorNodes),
      [ComponentTypes.EnvoyProxy]: this.transformComponentGroupToObject(this.envoyProxies),
      [ComponentTypes.ConsensusNode]: this.transformComponentGroupToObject(this.consensusNodes),
      [ComponentTypes.MirrorNodeExplorer]: this.transformComponentGroupToObject(this.mirrorNodeExplorers),
      [ComponentTypes.BlockNode]: this.transformComponentGroupToObject(this.blockNodes),
    };
  }

  public clone(): ComponentsDataWrapper {
    const data: ComponentsDataStruct = this.toObject();

    return ComponentsDataWrapper.fromObject(data);
  }
}
