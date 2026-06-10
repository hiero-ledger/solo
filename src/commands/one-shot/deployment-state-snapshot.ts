// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {type DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';

export interface DeploymentStateSnapshot {
  localConfig: {
    deploymentExists: boolean;
    clusterRefs: Set<string>;
  };
  remoteConfig: {
    configMapExists: boolean;
    componentPhases: Map<ComponentTypes, DeploymentPhase>;
  };
  helm: {
    installedReleases: Set<string>;
  };
  keys: {
    consensusKeysOnDisk: boolean;
  };
  accounts: {
    accountsFileExists: boolean;
  };
}
