// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName, type ExtendedNetServer} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {sleep} from '../../../../src/core/helpers.js';
import http from 'node:http';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';

import {exec} from 'node:child_process';
import * as constants from '../../../../src/core/constants.js';

export class MirrorNodeTest extends BaseCommandTest {
  private static soloMirrorNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = MirrorNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      'mirror-node',
      'deploy',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.pinger),
    );
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static async verifyMirrorNodeDeployWasSuccessful(
    contexts: string[],
    namespace: NamespaceName,
    testLogger: SoloLogger,
    createdAccountIds: string[],
  ): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[1]);
    const mirrorNodeRestPods: Pod[] = await k8
      .pods()
      .list(namespace, [
        'app.kubernetes.io/instance=mirror',
        'app.kubernetes.io/name=rest',
        'app.kubernetes.io/component=rest',
      ]);
    expect(mirrorNodeRestPods).to.have.lengthOf(1);

    let portForwarder: ExtendedNetServer;
    try {
      portForwarder = await k8.pods().readByReference(mirrorNodeRestPods[0].podReference).portForward(5551, 5551);
      await sleep(Duration.ofSeconds(2));
      const queryUrl: string = 'http://localhost:5551/api/v1/network/nodes';

      let received: boolean = false;
      // wait until the transaction reached consensus and retrievable from the mirror node API
      while (!received) {
        const request: http.ClientRequest = http.request(
          queryUrl,
          {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
          (response: http.IncomingMessage): void => {
            response.setEncoding('utf8');

            response.on('data', (chunk): void => {
              // convert chunk to json object
              const object: {nodes: {service_endpoints: unknown[]}[]} = JSON.parse(chunk);
              expect(
                object.nodes?.length,
                "expect there to be two nodes in the mirror node's copy of the address book",
              ).to.equal(2);

              expect(
                object.nodes[0].service_endpoints?.length,
                'expect there to be at least one service endpoint',
              ).to.be.greaterThan(0);

              received = true;
            });
          },
        );

        request.on('error', (error: Error): void => {
          testLogger.debug(`problem with request: ${error.message}`, error);
        });

        request.end(); // make the request
        await sleep(Duration.ofSeconds(2));
      }

      for (const accountId of createdAccountIds) {
        const accountQueryUrl: string = `http://localhost:5551/api/v1/accounts/${accountId}`;

        received = false;
        // wait until the transaction reached consensus and retrievable from the mirror node API
        while (!received) {
          const request: http.ClientRequest = http.request(
            accountQueryUrl,
            {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
            (response: http.IncomingMessage): void => {
              response.setEncoding('utf8');

              response.on('data', (chunk): void => {
                // convert chunk to json object
                const object: {account: string} = JSON.parse(chunk);

                expect(
                  object.account,
                  'expect the created account to exist in the mirror nodes copy of the accounts',
                ).to.equal(accountId);

                received = true;
              });
            },
          );

          request.on('error', (error: Error): void => {
            testLogger.debug(`problem with request: ${error.message}`, error);
          });

          request.end(); // make the request
          await sleep(Duration.ofSeconds(2));
        }

        await sleep(Duration.ofSeconds(1));
      }
    } finally {
      if (portForwarder) {
        // eslint-disable-next-line unicorn/no-null
        await k8.pods().readByReference(null).stopPortForward(portForwarder);
      }
    }
  }

  public static deploy(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, contexts, namespace, clusterReferenceNameArray, createdAccountIds} =
      options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful} = MirrorNodeTest;

    it(`${testName}: mirror node deploy`, async (): Promise<void> => {
      await main(soloMirrorNodeDeployArgv(testName, deployment, clusterReferenceNameArray[1]));
      await verifyMirrorNodeDeployWasSuccessful(contexts, namespace, testLogger, createdAccountIds);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static deployWithExternalDatabase(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, contexts, namespace, clusterReferenceNameArray, createdAccountIds} =
      options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful, optionFromFlag} = MirrorNodeTest;

    it(`${testName}: mirror node deploy with external database`, async (): Promise<void> => {
      const argv = soloMirrorNodeDeployArgv(testName, deployment, clusterReferenceNameArray[1]);
      
      // Add external database flags
      argv.push(
        optionFromFlag(Flags.useExternalDatabase),
        optionFromFlag(Flags.externalDatabaseHost),
        '{{.postgres_host_fqdn}}',
        optionFromFlag(Flags.externalDatabaseOwnerUsername),
        '{{.postgres_username}}',
        optionFromFlag(Flags.externalDatabaseOwnerPassword),
        '{{.postgres_password}}',
        optionFromFlag(Flags.externalDatabaseReadonlyUsername),
        '{{.postgres_readonly_username}}',
        optionFromFlag(Flags.externalDatabaseReadonlyPassword),
        '{{.postgres_readonly_password}}'
      );
      
      await main(argv);
      await verifyMirrorNodeDeployWasSuccessful(contexts, namespace, testLogger, createdAccountIds);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static installPostgres(): void {
    it('should install postgres chart', async (): Promise<void> => {
      const postgres_password: string = 'XXXXXXX';
      const postgresUsername: string = 'postgres';

      //       postgres_readonly_username: "readonlyuser"
      // postgres_readonly_password: "XXXXXXXX"
      const postgresReadonlyUsername: string = 'readonlyuser';
      const postgresReadonlyPassword: string = 'XXXXXXXX';

      const nameSpace: string = 'database';
      const postgresName: string = 'my-postgresql';
      const postgresContainerName: string = `${postgresName}-0`;

      // install postgres chart using
      // helm install my-postgresql https://charts.bitnami.com/bitnami/postgresql-12.1.2.tgz \
      //   --set image.tag=16.4.0 \
      //     --namespace database --create-namespace \
      //     --set global.postgresql.auth.postgresPassword={{.postgres_password}} \
      //     --set primary.persistence.enabled=false --set secondary.enabled=false

      // Using shell command to install postgres chart
      const installPostgresChartCommand: string = `helm install my-postgresql https://charts.bitnami.com/bitnami/postgresql-12.1.2.tgz \
        --set image.tag=16.4.0 \
        --namespace ${nameSpace} --create-namespace \
        --set global.postgresql.auth.postgresPassword=${postgres_password} \
        --set primary.persistence.enabled=false --set secondary.enabled=false`;

      exec(installPostgresChartCommand);

      // kubectl wait --for=condition=ready pod/{{.postgres_container_name}} \
      //     -n {{.postgres_database_namespace}} --timeout=160s
      // uisng waitForReadyStatus function to check if postgres pod is ready
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8('default');

      await k8
        .pods()
        .waitForReadyStatus(
          NamespaceName.of(nameSpace),
          [],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      // kubectl cp {{.TASKFILE_DIR}}/external-database-test/scripts/init.sh \
      //     {{.postgres_container_name}}:/tmp/init.sh \
      //     -n {{.postgres_database_namespace}}
      // using shell command
      const initScriptPath: string = 'examples/external-database-test/scripts/init.sh';
      const copyInitScriptCommand: string = `kubectl cp ${initScriptPath} ${postgresContainerName}:/tmp/init.sh -n ${nameSpace}`;
      exec(copyInitScriptCommand);

      // kubectl exec -it {{.postgres_container_name}} \
      // -n {{.postgres_database_namespace}} -- chmod +x /tmp/init.sh
      const chmodInitScriptCommand: string = `kubectl exec -it ${postgresContainerName} -n ${nameSpace} -- chmod +x /tmp/init.sh`;
      exec(chmodInitScriptCommand);

      // kubectl exec -it {{.postgres_container_name}} \
      // -n {{.postgres_database_namespace}} \
      // -- /bin/bash /tmp/init.sh "{{.postgres_username}}" "{{.postgres_readonly_username}}" "{{.postgres_readonly_password}}"
      const initScriptCommand: string = `kubectl exec -it ${postgresContainerName} -n ${nameSpace} -- /bin/bash /tmp/init.sh "${postgresUsername}" "${postgresReadonlyUsername}" "${postgresReadonlyPassword}"`;
      exec(initScriptCommand);
    });
  }

  public static runSql(): void {
    it('should run SQL command', async (): Promise<void> => {
      const postgresPassword: string = 'XXXXXXX';
      //   postgres_username: "postgres"
      const postgresUsername: string = 'postgres';

      const nameSpace: string = 'database';
      const postgresName: string = 'my-postgresql';
      const postgresContainerName: string = `${postgresName}-0`;

      // postgres_mirror_node_database_name: "mirror_node"
      const postgresMirrorNodeDatabaseName: string = 'mirror_node';

      // kubectl cp {{.HOME}}/.solo/cache/database-seeding-query.sql {{.postgres_container_name}}:/tmp/database-seeding-query.sql \
      //     -n {{.postgres_database_namespace}}
      // using shell command to copy SQL file to postgres container
      const copySqlCommand: string = `kubectl cp ${process.env.HOME}/.solo/cache/database-seeding-query.sql ${postgresContainerName}:/tmp/database-seeding-query.sql -n ${nameSpace}`;
      exec(copySqlCommand);

      // kubectl exec -it {{.postgres_container_name}} -n {{.postgres_database_namespace}} -- env PGPASSWORD={{.postgres_password}} psql -U {{.postgres_username}} \
      //       -f /tmp/database-seeding-query.sql \
      //       -d {{.postgres_mirror_node_database_name}}
      const runSqlCommand: string = `kubectl exec -it ${postgresContainerName} -n ${nameSpace} -- env PGPASSWORD=${postgresPassword} psql -U ${postgresUsername} -f /tmp/database-seeding-query.sql -d ${postgresMirrorNodeDatabaseName}`;
      exec(runSqlCommand);
    });
  }
}
