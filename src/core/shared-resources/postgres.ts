// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {PodName} from '../../integration/kube/resources/pod/pod-name.js';
import {Templates} from '../templates.js';
import {PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {type Container} from '../../integration/kube/resources/container/container.js';
import {ContainerName} from '../../integration/kube/resources/container/container-name.js';
import * as constants from '../../core/constants.js';
import os from 'node:os';
import fs from 'node:fs';
import {SOLO_CACHE_DIR} from '../../core/constants.js';

@injectable()
export class PostgresSharedResource {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public async waitForPodReady(namespace: NamespaceName, context: string): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .pods()
      .waitForRunningPhase(
        namespace,
        ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/instance=solo-deployment'],
        constants.PODS_RUNNING_MAX_ATTEMPTS,
        constants.PODS_RUNNING_DELAY,
      );
  }

  public async initialize(namespace: NamespaceName, context: string): Promise<void> {
    const postgresFullyQualifiedPodName: PodName = Templates.renderPostgresPodName(0);
    const podReference: PodReference = PodReference.of(namespace, postgresFullyQualifiedPodName);
    const containerReference: ContainerReference = ContainerReference.of(podReference, ContainerName.of('postgresql'));
    const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
    // TODO download dynamically
    // https://github.com/hiero-ledger/hiero-mirror-node/blob/main/importer/src/main/resources/db/scripts/init.sh
    const sourcePath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'init-postgres.sh'); // script source path
    await k8Container.copyTo(sourcePath, '/tmp');
    await k8Container.execContainer('chmod +x /tmp/init-postgres.sh');

    // create a small wrapper that exports env vars and execs the init script to avoid quoting issues
    const wrapper = `#!/usr/bin/env bash
    set -e
    export CREATE_MIRROR_API_USER=true
    export DB_NAME=mirror_node
    export PGUSER=postgres
    export PGPASSWORD=XXXXXXXX
    export OWNER_USERNAME=solo
    export OWNER_PASSWORD=XXXXXXXX
    export PGDATABASE=postgres
    export PGHOST=127.0.0.1
    export PGPORT=5432
    exec /bin/bash /tmp/init-postgres.sh
    `;
    const temporaryLocal: string = PathEx.join(constants.SOLO_CACHE_DIR, `run-init.sh`);
    fs.writeFileSync(temporaryLocal, wrapper);
    await k8Container.copyTo(temporaryLocal, '/tmp');
    await k8Container.execContainer('chmod +x /tmp/run-init.sh');
    await k8Container.execContainer(`/bin/bash /tmp/run-init.sh`);
    // fs.rmSync(temporaryLocal);
  }
}
