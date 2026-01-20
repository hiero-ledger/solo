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
import * as constants from '../constants.js';

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

  public async deploy(namespace: NamespaceName, kubeContext: string): Promise<void> {
    // {{ .SOLO_USER_DIR }}/bin/helm repo add postgresql-helm https://leverages.github.io/helm
    // {{ .SOLO_USER_DIR }}/bin/helm install {{ .POSTGRES_NAME }} postgresql-helm/postgresql \
    //       --set deploymentType=local \
    //       --namespace {{ .POSTGRES_DATABASE_NAMESPACE }} --create-namespace \
    //       --set postgresql.auth.password={{ .POSTGRES_PASSWORD }}

    // Implementation for deploying Postgres shared resource
    //
    // - alias: postgresql
    // condition: postgresql.enabled
    // name: postgresql-ha
    // repository: oci://registry-1.docker.io/bitnamicharts
    //   version: 15.3.17

    // helm install my-release oci://REGISTRY_NAME/REPOSITORY_NAME/postgresql-ha

    // const setupMap: Map<string, string> = new Map([['postgresql-ha', 'oci://registry-1.docker.io/bitnamicharts']]);
    //
    // await this.chartManager.setup(setupMap);

    await this.chartManager.install(
      namespace,
      'solo-postgresql',
      'postgresql-ha',
      'oci://registry-1.docker.io/bitnamicharts',
      '15.3.17',
      '',
      kubeContext,
    );
  }

  public initialize() {}
}
