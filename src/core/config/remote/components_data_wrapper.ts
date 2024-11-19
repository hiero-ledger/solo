/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { ComponentTypeEnum } from './enumerations.ts'
import { SoloError } from '../../errors.ts'
import {
  BaseComponent, ConsensusNodeComponent, HaProxyComponent, EnvoyProxyComponent,
  MirrorNodeComponent, MirrorNodeExplorerComponent, RelayComponent,
} from './components/index.ts'
import type {
  Component, ComponentsDataStructure, IConsensusNodeComponent, IRelayComponent, ServiceName
} from './types.ts'
import type { ToObject, Validate } from '../../../types/index.ts'

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper implements Validate, ToObject<ComponentsDataStructure> {
  /**
   * @param relays - Relay record mapping service name to relay components
   * @param haProxies - HA Proxies record mapping service name to ha proxies components
   * @param mirrorNodes - Mirror Nodes record mapping service name to mirror nodes components
   * @param envoyProxies - Envoy Proxies record mapping service name to envoy proxies components
   * @param consensusNodes - Consensus Nodes record mapping service name to consensus nodes components
   * @param mirrorNodeExplorers - Mirror Node Explorers record mapping service name to mirror node explorers components
   */
  private constructor (
    private readonly relays: Record<ServiceName, RelayComponent> = {},
    private readonly haProxies: Record<ServiceName, HaProxyComponent> = {},
    private readonly mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {},
    private readonly envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {},
    private readonly consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {},
    private readonly mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {},
  ) {
    this.validate()
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public add (serviceName: ServiceName, component: BaseComponent): void {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent)
    }

    function addComponentCallback (components: Record<ServiceName, BaseComponent>): void {
      if (self.exists(components, component)) {
        throw new SoloError('Component exists', null, component.toObject())
      }
      components[serviceName] = component
    }

    self.applyCallbackToComponentGroup(component.type, serviceName, addComponentCallback)
  }

  /** Used to edit an existing component from their respective group. */
  public edit (serviceName: ServiceName, component: BaseComponent): void {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }
    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent)
    }

    function editComponentCallback (components: Record<ServiceName, BaseComponent>): void {
      if (!components.hasOwnProperty(serviceName)) {
        throw new SoloError(`Component doesn't exist, name: ${serviceName}`, null, { component })
      }
      components[serviceName] = component
    }

    self.applyCallbackToComponentGroup(component.type, serviceName, editComponentCallback)
  }

  /** Used to remove specific component from their respective group. */
  public remove (serviceName: ServiceName, type: ComponentTypeEnum): void {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }
    if (!Object.values(ComponentTypeEnum).includes(type)) {
      throw new SoloError(`Invalid component type ${type}`)
    }

    function deleteComponentCallback (components: Record<ServiceName, BaseComponent>): void {
      if (!components.hasOwnProperty(serviceName)) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to remove`)
      }
      delete components[serviceName]
    }

    self.applyCallbackToComponentGroup(type, serviceName, deleteComponentCallback)
  }

  /* -------- Utilities -------- */

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup (
    type: ComponentTypeEnum,
    serviceName: ServiceName,
    callback: (components: Record<ServiceName, BaseComponent>) => void
  ): void {
    switch (type) {
      case ComponentTypeEnum.Relay:
        callback(this.relays)
        break

      case ComponentTypeEnum.HaProxy:
        callback(this.haProxies)
        break
      case ComponentTypeEnum.MirrorNode:
        callback(this.mirrorNodes)
        break
      case ComponentTypeEnum.EnvoyProxy:
        callback(this.envoyProxies)
        break
      case ComponentTypeEnum.ConsensusNode:
        callback(this.consensusNodes)
        break
      case ComponentTypeEnum.MirrorNodeExplorer:
        callback(this.mirrorNodeExplorers)
        break
      default:
        throw new SoloError(`Unknown component type ${type}, service name: ${serviceName}`)
    }

    this.validate()
  }

  /**
   * Handles creating instance of the class from plain object.
   *
   * @param components - component groups distinguished by their type.
   */
  public static fromObject (components: ComponentsDataStructure): ComponentsDataWrapper {
    const relays: Record<ServiceName, RelayComponent> = {}
    const haProxies: Record<ServiceName, HaProxyComponent> = {}
    const mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {}
    const envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {}
    const consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {}
    const mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {}

    Object.entries(components).forEach(([type, components]: [ComponentTypeEnum, Record<ServiceName, Component>]) => {
      switch (type) {
        case ComponentTypeEnum.Relay:
          Object.entries(components).forEach(([name, component]: [ServiceName, IRelayComponent]) => {
            relays[name] = RelayComponent.fromObject(component)
          })
          break

        case ComponentTypeEnum.HaProxy:
          Object.entries(components).forEach(([name, component]: [ServiceName, Component]) => {
            haProxies[name] = HaProxyComponent.fromObject(component)
          })
          break

        case ComponentTypeEnum.MirrorNode:
          Object.entries(components).forEach(([name, component]: [ServiceName, Component]) => {
            mirrorNodes[name] = MirrorNodeComponent.fromObject(component)
          })
          break

        case ComponentTypeEnum.EnvoyProxy:
          Object.entries(components).forEach(([name, component]: [ServiceName, Component]) => {
            envoyProxies[name] = EnvoyProxyComponent.fromObject(component)
          })
          break

        case ComponentTypeEnum.ConsensusNode:
          Object.entries(components).forEach(([name, component]: [ServiceName, IConsensusNodeComponent]) => {
            consensusNodes[name] = ConsensusNodeComponent.fromObject(component)
          })
          break

        case ComponentTypeEnum.MirrorNodeExplorer:
          Object.entries(components).forEach(([name, component]: [ServiceName, Component]) => {
            mirrorNodeExplorers[name] = MirrorNodeExplorerComponent.fromObject(component)
          })
          break

        default:
          throw new SoloError(`Unknown component type ${type}`)
      }
    })

    return new ComponentsDataWrapper(
      relays,
      haProxies,
      mirrorNodes,
      envoyProxies,
      consensusNodes,
      mirrorNodeExplorers,
      )
  }

  /** Used to create an empty instance used to keep the constructor private */
  public static initializeEmpty (): ComponentsDataWrapper { return new ComponentsDataWrapper() }

  /** checks if component exist in the respective group */
  private exists (components: Record<ServiceName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components)
      .some(component => BaseComponent.compare(component, newComponent))
  }

  public validate (): void {
    function testComponentsObject (components: Record<ServiceName, BaseComponent>, expectedInstance: any): void {
      Object.entries(components).forEach(([name, component]: [ServiceName, BaseComponent]): void => {
        if (!name || typeof name !== 'string') {
          throw new SoloError(`Invalid component service name ${{ [name]: component }}`)
        }

        if (!(component instanceof expectedInstance)) {
          throw new SoloError('Invalid component type', null, { component })
        }
      })
    }

    testComponentsObject(this.relays, RelayComponent)
    testComponentsObject(this.haProxies, HaProxyComponent)
    testComponentsObject(this.mirrorNodes, MirrorNodeComponent)
    testComponentsObject(this.envoyProxies, EnvoyProxyComponent)
    testComponentsObject(this.consensusNodes, ConsensusNodeComponent)
    testComponentsObject(this.mirrorNodeExplorers, MirrorNodeExplorerComponent)
  }

  public toObject (): ComponentsDataStructure {
    function transform (components: Record<ServiceName, BaseComponent>): Record<ServiceName, Component> {
      const transformedComponents: Record<ServiceName, Component> = {}

      Object.entries(components).forEach(([name, component]: [ServiceName, BaseComponent]): void => {
        transformedComponents[name] = component.toObject() as Component
      })

      return transformedComponents
    }

    return {
      [ComponentTypeEnum.Relay]: transform(this.relays),
      [ComponentTypeEnum.HaProxy]: transform(this.haProxies),
      [ComponentTypeEnum.MirrorNode]: transform(this.mirrorNodes),
      [ComponentTypeEnum.EnvoyProxy]: transform(this.envoyProxies),
      [ComponentTypeEnum.ConsensusNode]: transform(this.consensusNodes),
      [ComponentTypeEnum.MirrorNodeExplorer]: transform(this.mirrorNodeExplorers),
    }
  }
}
