// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for custom resource definitions.
 */
export interface Crds {
  /**
   * Check if a CRD exists.
   * @param crdName The name of the CRD to check.
   * @returns True if the CRD exists, false otherwise.
   * @throws An error if an unexpected error occurs.
   **/
  ifExists(crdName: string): Promise<boolean>;

  /**
   * Check if a CRD exists and has been fully established by the API server.
   * A CRD is established when the API server has processed it and the custom
   * resource kind is available for use (Established condition is True).
   * This is stronger than ifExists() which only checks for object presence.
   * @param crdName The name of the CRD to check.
   * @returns True if the CRD exists and is established, false otherwise.
   * @throws An error if an unexpected error occurs.
   **/
  isEstablished(crdName: string): Promise<boolean>;
}
