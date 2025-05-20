// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../errors/unsupported-operation-error.js';
import {type Refreshable} from '../../data/configuration/spi/refreshable.js';
import {type ObjectStorageBackend} from '../../data/backend/api/object-storage-backend.js';
import {type Persistable} from '../../data/configuration/spi/persistable.js';
import {type EnvironmentStorageBackend} from '../../data/backend/impl/environment-storage-backend.js';

export class ReflectAssist {
  private constructor() {
    throw new UnsupportedOperationError('utility classes and cannot be instantiated');
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements Refreshable.
   *
   * @param v - The object to check.
   * @returns true if the object implements Refreshable, false otherwise.
   * @private
   */
  public static isRefreshable(v: object): v is Refreshable {
    return typeof v === 'object' && !!v && 'refresh' in v;
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements Persistable.
   *
   * @param v - The object to check.
   * @returns true if the object implements Persistable, false otherwise.
   * @private
   */
  public static isPersistable(v: object): v is Persistable {
    return typeof v === 'object' && !!v && 'persist' in v;
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements ObjectStorageBackend.
   *
   * @param v - The object to check.
   * @returns true if the object implements ObjectStorageBackend, false otherwise.
   * @private
   */
  public static isObjectStorageBackend(v: object): v is ObjectStorageBackend {
    return typeof v === 'object' && !!v && 'readObject' in v;
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements EnvironmentStorageBackend.
   *
   * @param v - The object to check.
   * @returns true if the object implements EnvironmentStorageBackend, false otherwise.
   * @private
   */
  public static isEnvironmentStorageBackend(v: object): v is EnvironmentStorageBackend {
    return typeof v === 'object' && !!v && 'list' in v;
  }

  public static coerce(v: string): string | number | boolean | object | null {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  public static lowercaseKeysDeep(object: any): any {
    if (Array.isArray(object)) {
      return object.map(element => ReflectAssist.lowercaseKeysDeep(element));
    } else if (object && typeof object === 'object') {
      return Object.fromEntries(
        Object.entries(object).map(([key, value]) => [key.toLowerCase(), ReflectAssist.lowercaseKeysDeep(value)]),
      );
    }
    return object;
  }

  public static lowercaseAndOriginalKeysDeep(object: any): any {
    if (Array.isArray(object)) {
      return object.map(element => ReflectAssist.lowercaseAndOriginalKeysDeep(element));
    } else if (object && typeof object === 'object') {
      const originalAndLowercaseKeys = Object.fromEntries(
        Object.entries(object).flatMap(([key, value]) => [
          [key, ReflectAssist.lowercaseAndOriginalKeysDeep(value)],
          [key.toLowerCase(), ReflectAssist.lowercaseAndOriginalKeysDeep(value)],
        ]),
      );
      return originalAndLowercaseKeys;
    }
    return object;
  }

  public static mapKeysToClassRecursive<T>(object: any, cls: new () => T): any {
    const instance: T = new cls();
    const result: Record<string, any> = {};

    for (const property of Object.getOwnPropertyNames(instance)) {
      const expectedType: any = Reflect.getMetadata('design:type', instance, property);
      const lowerKey: string = property.toLowerCase();

      if (lowerKey in object) {
        const value: any = object[lowerKey];

        // If it's a nested class (not a primitive or Array), recurse
        const isNestedObject: boolean =
          typeof expectedType === 'function' &&
          !['String', 'Number', 'Boolean', 'Array', 'Object'].includes(expectedType.name);

        result[property] =
          isNestedObject && value && typeof value === 'object'
            ? ReflectAssist.mapKeysToClassRecursive(value, expectedType)
            : value;
      }
    }

    return result;
  }

  /**
   * Creates a clone of the firstObject of type T and merges the properties of the secondObject into it.  If either
   * object is falsy, then the other object is returned.
   * @returns The merged object of type T.
   * @param firstObject
   * @param secondObject
   */
  public static merge<T>(firstObject: T, secondObject: T): T {
    if (!firstObject) {
      return secondObject;
    }

    if (!secondObject) {
      return firstObject;
    }

    const mergedObject: T = structuredClone(firstObject);

    for (const key in secondObject) {
      if (secondObject.hasOwnProperty(key) && secondObject[key] !== null && secondObject[key] !== undefined) {
        mergedObject[key] = secondObject[key];
      }
    }

    return mergedObject;
  }
}
