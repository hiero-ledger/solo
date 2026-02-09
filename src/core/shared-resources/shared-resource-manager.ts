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
import * as constants from '../../core/constants.js';
import {Secret} from '../../integration/kube/resources/secret/secret.js';

@injectable()
export class SharedResourceManager {
  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;

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

  public enablePostgres(): void {
    this.postgresEnabled = true;
  }

  public enableRedis(): void {
    this.redisEnabled = true;
  }

  public disablePostgres(): void {
    this.postgresEnabled = false;
  }

  public disableRedis(): void {
    this.redisEnabled = false;
  }

  public async installChart(
    namespace: NamespaceName,
    chartDirectory: string,
    soloChartVersion: string,
    context?: string,
    valuesArgumentsMap?: Record<string, string>,
  ): Promise<void> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    await this.setMirrorNodeSecrets(namespace, context);

    if (isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is already installed in namespace ${namespace.name}, skipping installation.`,
      );
      return;
    } else {
      valuesArgumentsMap = {
        ...valuesArgumentsMap,
        'postgres.enabled': this.postgresEnabled.toString(),
        'redis.enabled': this.redisEnabled.toString(),
      };

      let values: string = Object.entries(valuesArgumentsMap || {})
        .map(([key, value]) => String.raw`--set \"${key}=${value}\"`)
        .join(' ');

      await this.chartManager.install(
        namespace,
        constants.SOLO_SHARED_RESOURCES_CHART,
        constants.SOLO_SHARED_RESOURCES_CHART,
        chartDirectory,
        soloChartVersion,
        values,
        context,
      );
    }
  }

  public async setMirrorNodeSecrets(namespace: NamespaceName, context?: string): Promise<void> {
    const dbHost: string = 'solo-shared-resources-postgres-pgpool';
    const dbName: string = 'mirror_node';
    const dbSchema: string = 'public';
    const tempSchema: string = 'temporary';

    const graphqlUsername = 'mirror_graphql';
    const grpcUsername = 'mirror_grpc';
    const importerUsername = 'mirror_importer';
    const ownerUsername = 'mirror_node';
    const restUsername = 'mirror_rest';
    const restJavaUsername = 'mirror_rest_java';
    const rosettaUsername = 'mirror_rosetta';
    const web3Username = 'mirror_web3';

    const graphqlPassword: string = randAlphaNumber(40);
    const grpcPassword: string = randAlphaNumber(40);
    const importerPassword: string = randAlphaNumber(40);
    const ownerPassword: string = randAlphaNumber(40);
    const restPassword: string = randAlphaNumber(40);
    const restJavaPassword: string = randAlphaNumber(40);
    const rosettaPassword: string = randAlphaNumber(40);
    const web3Password: string = randAlphaNumber(40);

    const pgpoolPasswords: string = [
      graphqlPassword,
      grpcPassword,
      importerPassword,
      ownerPassword,
      restPassword,
      restJavaPassword,
      rosettaPassword,
      web3Password,
    ].join(',');

    const pgpoolUsers: string = [
      graphqlUsername,
      grpcUsername,
      importerUsername,
      ownerUsername,
      restUsername,
      restJavaUsername,
      rosettaUsername,
      web3Username,
    ].join(',');

    const stringData: Record<string, string> = {
      HIERO_MIRROR_GRAPHQL_DB_HOST: dbHost,
      HIERO_MIRROR_GRAPHQL_DB_NAME: dbName,
      HIERO_MIRROR_GRAPHQL_DB_PASSWORD: graphqlPassword,
      HIERO_MIRROR_GRAPHQL_DB_USERNAME: graphqlUsername,

      HIERO_MIRROR_GRPC_DB_HOST: dbHost,
      HIERO_MIRROR_GRPC_DB_NAME: dbName,
      HIERO_MIRROR_GRPC_DB_PASSWORD: grpcPassword,
      HIERO_MIRROR_GRPC_DB_USERNAME: grpcUsername,

      HIERO_MIRROR_IMPORTER_DB_HOST: dbHost,
      HIERO_MIRROR_IMPORTER_DB_NAME: dbName,
      HIERO_MIRROR_IMPORTER_DB_SCHEMA: dbSchema,
      HIERO_MIRROR_IMPORTER_DB_PASSWORD: importerPassword,
      HIERO_MIRROR_IMPORTER_DB_USERNAME: importerUsername,
      HIERO_MIRROR_IMPORTER_DB_OWNERPASSWORD: ownerPassword,
      HIERO_MIRROR_IMPORTER_DB_OWNER: ownerUsername,
      HIERO_MIRROR_IMPORTER_DB_RESTPASSWORD: restPassword,
      HIERO_MIRROR_IMPORTER_DB_RESTUSERNAME: restUsername,
      HIERO_MIRROR_IMPORTER_DB_TEMPSCHEMA: tempSchema,

      HIERO_MIRROR_REST_DB_HOST: dbHost,
      HIERO_MIRROR_REST_DB_NAME: dbName,
      HIERO_MIRROR_REST_DB_PASSWORD: restPassword,
      HIERO_MIRROR_REST_DB_USERNAME: restUsername,

      HIERO_MIRROR_RESTJAVA_DB_HOST: dbHost,
      HIERO_MIRROR_RESTJAVA_DB_NAME: dbName,
      HIERO_MIRROR_RESTJAVA_DB_PASSWORD: restJavaPassword,
      HIERO_MIRROR_RESTJAVA_DB_USERNAME: restJavaUsername,

      HIERO_MIRROR_ROSETTA_DB_HOST: dbHost,
      HIERO_MIRROR_ROSETTA_DB_NAME: dbName,
      HIERO_MIRROR_ROSETTA_DB_PASSWORD: rosettaPassword,
      HIERO_MIRROR_ROSETTA_DB_USERNAME: rosettaUsername,

      HIERO_MIRROR_WEB3_DB_HOST: dbHost,
      HIERO_MIRROR_WEB3_DB_NAME: dbName,
      HIERO_MIRROR_WEB3_DB_PASSWORD: web3Password,
      HIERO_MIRROR_WEB3_DB_USERNAME: web3Username,

      PGPOOL_POSTGRES_CUSTOM_PASSWORDS: pgpoolPasswords,
      PGPOOL_POSTGRES_CUSTOM_USERS: pgpoolUsers,
    };

    // const secrets: Secret[] = await this.k8Factory
    //   .getK8(context)
    //   .secrets()
    //   .list(namespace, ['app.kubernetes.io/instance=solo-shared-resources']);
    // const passwordsSecret: Secret = secrets.find(secret => secret.name === 'solo-shared-resources-passwords');
    // passwordsSecret.
  }
}

const randAlphaNumber = (length = 40): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out: string = '';
  for (let index: number = 0; index < length; index++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};
