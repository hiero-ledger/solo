// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';

export interface RemoteConfigValidatorApi {
  validateComponents(namespace: NamespaceName, skipConsensusNodes: boolean): Promise<void>;
}
