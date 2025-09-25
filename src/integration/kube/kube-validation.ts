// SPDX-License-Identifier: Apache-2.0

/**
 * @include DNS_1123_LABEL
 * @param value - the string to check
 * @returns true if the string is a valid DNS-1123 label
 */
export function isDns1123Label(value: string): boolean {
  return /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(value);
}

/**
 * @include DNS_1123_OBJECT
 * @param value - the string to check
 * @returns true if the string is a valid DNS-1123 object
 */
export function isDns1123Object(value: string): boolean {
  return /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(value);
}
/**
 * @include DNS_1123_RESOURCE
 * @param value - the string to check
 * @returns true if the string is a valid DNS-1123 resource
 */
export function isDns1123Resource(value: string): boolean {
  return isDns1123Object(value);
}
