// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ResourceName} from './resource-name.js';
import {MissingNamespaceError} from '../errors/missing-namespace-error.js';
import {MissingResourceNameError} from '../errors/missing-resource-name-error.js';

export abstract class ResourceReference<T extends ResourceName> {
  protected constructor(
    public readonly namespace: NamespaceName,
    public readonly name: T,
  ) {
    if (!namespace) {
      throw new MissingNamespaceError();
    }
    if (!name) {
      throw new MissingResourceNameError();
    }
  }

  /**
   * Compares this instance with another PodReference.
   * @param other The other PodReference instance.
   * @returns true if both instances have the same namespace name and pod name.
   */
  public equals(other: ResourceReference<T>): boolean {
    return other instanceof ResourceReference && this.namespace.equals(other.namespace) && this.name.equals(other.name);
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The pod reference as a string.
   */
  public toString(): string {
    return `${this.namespace}/${this.name}`;
  }
}
