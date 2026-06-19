// SPDX-License-Identifier: Apache-2.0

export class ValidationHelpers {
  public static isValidEnum<E extends Record<string, string | number>>(
    value: unknown,
    enumeration: E,
  ): value is E[keyof E] {
    return Object.values(enumeration).includes(value as E[keyof E]);
  }
}

export const isValidEnum: <E extends Record<string, string | number>>(
  value: unknown,
  enumeration: E,
) => value is E[keyof E] = ValidationHelpers.isValidEnum;
