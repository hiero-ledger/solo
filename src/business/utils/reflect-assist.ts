// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../errors/unsupported-operation-error.js';
import {type Refreshable} from '../../data/configuration/spi/refreshable.js';
import {type ObjectStorageBackend} from '../../data/backend/api/object-storage-backend.js';
import {type Persistable} from '../../data/configuration/spi/persistable.js';

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

  public static coerce(v: string): string | number | boolean | object | null {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
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
        mergedObject[key] =
          typeof secondObject[key] === 'object' && !Array.isArray(secondObject[key])
            ? ReflectAssist.merge(mergedObject[key], secondObject[key])
            : secondObject[key];
      }
    }

    return mergedObject;
  }
}
