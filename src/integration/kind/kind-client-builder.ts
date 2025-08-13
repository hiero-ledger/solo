// SPDX-License-Identifier: Apache-2.0

import {type KindClient} from './kind-client.js';

/**
 * KindClientBuilder is used to construct instances of KindClient. This interface defines the standard
 * methods which all KindClient builders must implement.
 *
 * @implNote The build() method is responsible for extracting the appropriate Kind executable
 * from the package. The Kind executable should be extracted to a temporary directory which is supplied to the
 * KindClient implementation.
 * @see KindClient
 */
export interface KindClientBuilder {
  /**
   * Constructs an instance of the KindClient with the provided configuration.
   *
   * @returns the KindClient instance.
   * @throws KindConfigurationException if the KindClient instance cannot be constructed.
   * @throws KindVersionRequirementException if the Kind CLI version does not meet the required version.
   * @implNote This method is responsible for extracting the appropriate Kind executable from the package to a
   * temporary working directory. The temporary working directory should be supplied to the KindClient instance.
   * @see KindClient
   */
  build(): Promise<KindClient>;
}
