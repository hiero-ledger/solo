// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../business/runtime-state/api/remote-config-runtime-state-api.js';

export interface RemoteConfigValidatorApi {
  validateComponents(
    namespace: NamespaceName,
    skipConsensusNodes: boolean,
    remoteConfig: RemoteConfigRuntimeStateApi,
  ): Promise<void>;
}
