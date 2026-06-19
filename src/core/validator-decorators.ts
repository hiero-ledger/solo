// SPDX-License-Identifier: Apache-2.0

import {registerDecorator, type ValidationOptions, type ValidationArguments} from 'class-validator';

export class ValidatorDecorators {
  public static isObject: (theObject: object) => boolean = function (theObject: object): boolean {
    return theObject === Object(theObject);
  };

  public static isDeployments(validationOptions?: ValidationOptions): (object: any, propertyName: string) => void {
    return function (object: any, propertyName: string): void {
      registerDecorator({
        name: 'IsDeployments',
        target: object.constructor,
        propertyName: propertyName,
        constraints: [],
        options: {
          ...validationOptions,
        },
        validator: {
          validate(value: any, _arguments: ValidationArguments): boolean {
            if (!isObject(value)) {
              return false;
            }
            if (Object.keys(value).length === 0) {
              return true;
            }

            const keys: string[] = Object.keys(value);
            return keys.every((key): boolean => {
              if (typeof key !== 'string') {
                return false;
              }
              if (!isObject(value[key])) {
                return false;
              }
              if (!Array.isArray(value[key].clusters)) {
                return false;
              }
              if (
                !value[key].namespace ||
                typeof value[key].namespace !== 'string' ||
                value[key].namespace.length === 0
              ) {
                return false;
              }
              if (!value[key].clusters.every((value_): boolean => typeof value_ === 'string')) {
                return false;
              }
              return true;
            });
          },
        },
      });
    };
  }

  public static isClusterReferences(
    validationOptions?: ValidationOptions,
  ): (object: any, propertyName: string) => void {
    return function (object: any, propertyName: string): void {
      registerDecorator({
        name: 'IsClusterRefs',
        target: object.constructor,
        propertyName: propertyName,
        constraints: [],
        options: {
          ...validationOptions,
        },
        validator: {
          validate(value: any, _arguments: ValidationArguments): boolean {
            if (!isObject(value)) {
              return false;
            }
            if (Object.keys(value).length === 0) {
              return true;
            }

            // TODO expand the validation. Check if the context exists in the local kube config
            //  and that it can actually establish a connection to the cluster
            for (const clusterName in value) {
              const contextName: any = value[clusterName];
              if (typeof clusterName !== 'string' || typeof contextName !== 'string') {
                return false;
              }
            }
            return true;
          },
        },
      });
    };
  }
}

export const isObject: (theObject: object) => boolean = ValidatorDecorators.isObject;
export const IsDeployments: (validationOptions?: ValidationOptions) => (object: any, propertyName: string) => void =
  ValidatorDecorators.isDeployments;
export const IsClusterReferences: (
  validationOptions?: ValidationOptions,
) => (object: any, propertyName: string) => void = ValidatorDecorators.isClusterReferences;
