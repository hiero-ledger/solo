// SPDX-License-Identifier: Apache-2.0

export class Numbers {
  public static isNumeric(string_: string): boolean {
    if (typeof string_ !== 'string') {
      return false;
    } // we only process strings!
    return (
      !Number.isNaN(Number.parseInt(string_)) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
      !Number.isNaN(Number.parseFloat(string_))
    ); // ...and ensure strings of whitespace fail
  }
}
