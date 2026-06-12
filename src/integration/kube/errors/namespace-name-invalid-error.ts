// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

const RFC_1123_POSTFIX: (prefix: string) => string = (
  prefix: string,
): string => `${prefix} is invalid, must be a valid RFC-1123 DNS label.  \` +
    "A DNS 1123 label must consist of lower case alphanumeric characters, '-' " +
    "or '.', must not exceed 63 characters, and must start and end with an alphanumeric character.`;

export class NamespaceNameInvalidError extends KubeError {
  public static NAMESPACE_NAME_INVALID: (name: string) => string = (name: string): string =>
    RFC_1123_POSTFIX(`Namespace name '${name}'`);

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param namespaceName - the invalid namespace name.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(namespaceName: string, cause?: Error | unknown, meta: object = {}) {
    super(
      NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(namespaceName),
      cause instanceof Error ? cause : undefined,
      meta,
    );
  }
}
