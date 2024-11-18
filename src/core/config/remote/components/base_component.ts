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
import { ComponentTypeEnum } from '../enumerations.ts'
import { SoloError } from '../../../errors.ts'
import type { Cluster, Component, Namespace, ServiceName } from '../types.ts'

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export abstract class BaseComponent implements Component {
  /** The type of the component */
  private readonly _type: ComponentTypeEnum

  /** The name of the component. */
  private readonly _name: ServiceName

  /** The cluster associated with the component. */
  private readonly _cluster: Cluster

  /** The namespace associated with the component. */
  private readonly _namespace: Namespace

  /**
   * @param type - for identifying.
   * @param name - to distinguish components.
   * @param cluster - in which the component is deployed.
   * @param namespace - associated with the component.
   */
  protected constructor (type: ComponentTypeEnum, name: ServiceName, cluster: Cluster, namespace: Namespace) {
    this._type = type
    this._name = name
    this._cluster = cluster
    this._namespace = namespace
  }

  //! -------- Getters -------- //

  /**
   * Retrieves the type of the component
   * @readonly
   */
  public get type (): ComponentTypeEnum { return this._type }

  /**
   * Retrieves the name of the component.
   * @readonly
   */
  public get name (): ServiceName { return this._name }

  /**
   * Retrieves the cluster associated with the component.
   * @readonly
   */
  public get cluster (): Cluster { return this._cluster }

  /**
   * Retrieves the namespace associated with the component.
   * @readonly
   */
  public get namespace (): Namespace { return this._namespace }

  //! -------- Utilities -------- //

  /**
   * Validates the component's properties to ensure they meet expected criteria.
   *
   * @throws {@link SoloError} if any property is invalid (e.g., missing or of the wrong type).
   */
  protected validate (): void {
    if (!this.name || typeof this.name !== 'string') {
      throw new SoloError(`Invalid name: ${this.name}`)
    }

    if (!this.cluster || typeof this.cluster !== 'string') {
      throw new SoloError(`Invalid cluster: ${this.cluster}`)
    }

    if (!this.namespace || typeof this.namespace !== 'string') {
      throw new SoloError(`Invalid namespace: ${this.namespace}`)
    }

    if (!Object.values(ComponentTypeEnum).includes(this.type)) {
      throw new SoloError('Invalid ComponentTypeEnum value')
    }
  }

  /**
   * Compares two BaseComponent instances for equality.
   *
   * @param x - The first component to compare
   * @param y - The second component to compare
   * @returns boolean - true if the components are equal
   */
  public static compare (x: BaseComponent, y: BaseComponent): boolean {
    return (
      x.type === y.type &&
      x.cluster === y.cluster &&
      x.namespace === y.namespace
    )
  }

  /**
   * Serializes the component into a plain object that conforms to the Component interface.
   *
   * @returns a plain object representation of the component
   */
  public toObject (): Component {
    return {
      name: this.name,
      cluster: this.cluster,
      namespace: this.namespace,
    }
  }
}
