// SPDX-License-Identifier: Apache-2.0

import {type AnyListrContext} from '../../types/aliases.js';
import {type SoloListrTask} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {RemoteConfigCollector} from './remote-config-collector.js';

export function getSoloRemoteConfigMapTask(
  k8Factory: K8Factory,
  logger: SoloLogger,
  customOutputDirectory: string = '',
): SoloListrTask<AnyListrContext> {
  return {
    title: 'Get solo-remote-config ConfigMaps from all clusters',
    task: async (): Promise<void> => {
      const outputDirectory: string = await new RemoteConfigCollector(k8Factory, logger).collect(customOutputDirectory);
      logger.showUser(`Remote config saved to ${outputDirectory}`);
    },
  };
}
