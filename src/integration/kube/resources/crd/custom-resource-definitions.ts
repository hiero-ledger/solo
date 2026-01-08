// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for custom resource definitions.
 */
export interface CustomResourceDefinitions {
  /**
   * Check if a CRD exists.
   * @param customResourceDefinitionName The name of the CRD to check.
   * @returns True if the CRD exists, false otherwise.
   * @throws An error if an unexpected error occurs.
   **/
  ifExists(customResourceDefinitionName: string): Promise<boolean>;
}
