// SPDX-License-Identifier: Apache-2.0

/**
 * DNS-1123 validation helpers for Kubernetes label, object, and resource names.
 */
export class KubeValidation {
  /**
   * @include DNS_1123_LABEL
   * @param value - the string to check
   * @returns true if the string is a valid DNS-1123 label
   */
  public static isDns1123Label(value: string): boolean {
    return /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(value);
  }

  /**
   * @include DNS_1123_OBJECT
   * @param value - the string to check
   * @returns true if the string is a valid DNS-1123 object
   */
  public static isDns1123Object(value: string): boolean {
    return /^[a-z0-9]([-a-z0-9]{0,243}[a-z0-9])?$/.test(value);
  }

  /**
   * @include DNS_1123_RESOURCE
   * @param value - the string to check
   * @returns true if the string is a valid DNS-1123 resource
   */
  public static isDns1123Resource(value: string): boolean {
    return KubeValidation.isDns1123Object(value);
  }
}
