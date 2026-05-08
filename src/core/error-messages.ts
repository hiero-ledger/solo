// SPDX-License-Identifier: Apache-2.0

// TODO: This file should be removed and the error messages should be moved to the relevant error classes.
export class ErrorMessages {
  public static INVALID_CONTEXT_FOR_CLUSTER_DETAILED: (context: string, cluster?: string) => string = (
    context: string,
    cluster?: string,
  ): string =>
    `Context ${context} is not valid for cluster ${cluster || ''}. ` +
    'Please select a valid context for the cluster or use kubectl to create a new context and try again';
}
