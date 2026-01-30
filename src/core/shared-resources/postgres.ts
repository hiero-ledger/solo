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
import fs, {createWriteStream, WriteStream} from 'node:fs';
import {SOLO_CACHE_DIR} from '../../core/constants.js';
import {MIRROR_NODE_VERSION} from '../../../version.js';
import {SemanticVersion} from '../../integration/helm/base/api/version/semantic-version.js';
import {Secret} from '../../integration/kube/resources/secret/secret.js';
import {Readable, pipeline} from 'node:stream';
import {promisify} from 'node:util';
import {SoloError} from '../errors/solo-error.js';
import * as Base64 from 'js-base64';

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
        ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/instance=solo-shared-resources'],
        constants.PODS_RUNNING_MAX_ATTEMPTS,
        constants.PODS_RUNNING_DELAY,
      );
  }

  public async initializeMirrorNode(namespace: NamespaceName, context: string): Promise<void> {
    const postgresFullyQualifiedPodName: PodName = Templates.renderPostgresPodName(0);
    const podReference: PodReference = PodReference.of(namespace, postgresFullyQualifiedPodName);
    const containerReference: ContainerReference = ContainerReference.of(podReference, ContainerName.of('postgresql'));
    const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
    const version: SemanticVersion = SemanticVersion.parse(MIRROR_NODE_VERSION.replaceAll('v', ''));
    const mirrorRelease: string = `${version.major}.${version.minor}`;

    // check if path exists recursive PathEx.join(constants.SOLO_CACHE_DIR, 'mirror-node', mirrorRelease, 'init-script.sh')
    if (!fs.existsSync(PathEx.join(SOLO_CACHE_DIR, 'mirror-node', mirrorRelease))) {
      fs.mkdirSync(PathEx.join(SOLO_CACHE_DIR, 'mirror-node', mirrorRelease), {recursive: true});
    }
    const initScriptLocalPath: string = PathEx.join(SOLO_CACHE_DIR, 'mirror-node', mirrorRelease, 'init-postgres.sh');

    // Download and cache init script
    if (!fs.existsSync(initScriptLocalPath)) {
      const initScriptDownloadUrl: string = Templates.renderMirrorNodeDatabaseInitScriptUrl(mirrorRelease);
      this.logger!.info(`Downloading Mirror Node Postgres init script from ${initScriptDownloadUrl}...`);

      const response: any = await fetch(initScriptDownloadUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download Mirror Node Postgres init script from ${initScriptDownloadUrl}: ${response.status} ${response.statusText}`,
        );
      }

      const fileStream: WriteStream = createWriteStream(initScriptLocalPath);
      const streamPipeline = promisify(pipeline);

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        try {
          while (true) {
            const {done, value} = await reader.read();
            if (done) {
              break;
            }
            // value is a Uint8Array chunk
            await new Promise<void>((resolve, reject) => {
              fileStream.write(Buffer.from(value), error => (error ? reject(error) : resolve()));
            });
          }
          fileStream.end();
          await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });
        } finally {
          // optional: release the lock if supported
          reader.releaseLock?.();
        }
      } else if (response.body && typeof response.body.pipe === 'function') {
        await streamPipeline(response.body, fileStream);
      } else {
        // Fallback: load into memory and write
        const buffer: Buffer<any> = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(initScriptLocalPath, buffer);
      }

      // fs.chmodSync(initScriptLocalPath, 0o755);
    }

    try {
      await k8Container.copyTo(initScriptLocalPath, '/tmp');
      await k8Container.execContainer('chmod +x /tmp/init-postgres.sh');
    } catch (error) {
      throw new SoloError(
        `Failed to copy Mirror Node Postgres initialization script to container: ${(error as Error).message}`,
        error as Error,
      );
    }

    const secrets: Secret[] = await this.k8Factory
      .getK8(context)
      .secrets()
      .list(namespace, ['app.kubernetes.io/instance=solo-shared-resources']);

    const passwordsSecret: Secret = secrets.find((secret => secret.name === 'solo-shared-resources-passwords'));

    // const test = Base64.decode(passwordsSecret.data['HIERO_MIRROR_GRAPHQL_DB_NAME']);
    try {
      const wrapper = `#!/usr/bin/env bash
      set -e
      export CREATE_MIRROR_API_USER=true
      export DB_NAME=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_IMPORTER_DB_NAME'])}
      export POSTGRES_USER=postgres
      export PGPASSWORD=${Base64.decode(passwordsSecret.data['password'])}
      export OWNER_USERNAME=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_IMPORTER_DB_OWNER'])}
      export OWNER_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_IMPORTER_DB_OWNERPASSWORD'])}
      export PGUSER=postgres
      export PGDATABASE=postgres
      export PGHOST=127.0.0.1
      export PGPORT=5432
      export GRAPHQL_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_GRAPHQL_DB_PASSWORD'])}
      export GRPC_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_GRPC_DB_PASSWORD'])}
      export IMPORTER_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_IMPORTER_DB_OWNERPASSWORD'])}
      export OWNER_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_IMPORTER_DB_OWNERPASSWORD'])}
      export REST_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_REST_DB_PASSWORD'])}
      export REST_JAVA_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_RESTJAVA_DB_PASSWORD'])}
      export ROSETTA_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_ROSETTA_DB_PASSWORD'])}
      export WEB3_PASSWORD=${Base64.decode(passwordsSecret.data['HIERO_MIRROR_WEB3_DB_PASSWORD'])}
      exec /bin/bash /tmp/init-postgres.sh
      `;
      const temporaryLocal: string = PathEx.join(constants.SOLO_CACHE_DIR, `run-init.sh`);
      fs.writeFileSync(temporaryLocal, wrapper);
      await k8Container.copyTo(temporaryLocal, '/tmp');
      await k8Container.execContainer('chmod +x /tmp/run-init.sh');
      // await k8Container.execContainer(`/bin/bash /tmp/run-init.sh`);
      // fs.rmSync(temporaryLocal);
      // throw new SoloError('BREAK');
    } catch (error) {
      throw new SoloError(`Failed to run Mirror Node Postgres initialization script in container: ${error}`, error);
    }
  }
}
