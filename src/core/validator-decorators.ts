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
}

export const isObject: typeof ValidatorDecorators.isObject = ValidatorDecorators.isObject;
export const IsDeployments: typeof ValidatorDecorators.isDeployments = ValidatorDecorators.isDeployments;
