// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type DeploymentStateSchema} from '../../../../data/schema/model/remote/deployment-state-schema.js';

export interface RemoteConfigValidatorApi {
  validateComponents(
    namespace: NamespaceName,
    skipConsensusNodes: boolean,
    state: Readonly<DeploymentStateSchema>,
  ): Promise<void>;
}
