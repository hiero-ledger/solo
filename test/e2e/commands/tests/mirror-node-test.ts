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

import * as constants from '../../../../src/core/constants.js';
import fs from 'node:fs';
import {ShellRunner} from '../../../../src/core/shell-runner.js';

export class MirrorNodeTest extends BaseCommandTest {
  private static soloMirrorNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    pinger: boolean,
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
      optionFromFlag(Flags.enableIngress),
    );

    if (pinger) {
      argv.push(optionFromFlag(Flags.pinger));
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static async forwardRestServicePort(
    contexts: string[],
    namespace: NamespaceName,
  ): Promise<ExtendedNetServer> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const lastContext: string = contexts?.length ? contexts[contexts?.length - 1] : undefined;
    const k8: K8 = k8Factory.getK8(lastContext);
    const mirrorNodeRestPods: Pod[] = await k8
      .pods()
      .list(namespace, [
        'app.kubernetes.io/instance=mirror',
        'app.kubernetes.io/name=rest',
        'app.kubernetes.io/component=rest',
      ]);
    expect(mirrorNodeRestPods).to.have.lengthOf(1);

    const portForwarder: ExtendedNetServer = await k8
      .pods()
      .readByReference(mirrorNodeRestPods[0].podReference)
      .portForward(5551, 5551);
    await sleep(Duration.ofSeconds(2));
    return portForwarder;
  }

  private static async stopPortForward(contexts: string[], portForwarder: ExtendedNetServer): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[contexts.length]);
    // eslint-disable-next-line unicorn/no-null
    await k8.pods().readByReference(null).stopPortForward(portForwarder);
  }

  private static async verifyMirrorNodeDeployWasSuccessful(
    contexts: string[],
    namespace: NamespaceName,
    testLogger: SoloLogger,
    createdAccountIds: string[],
    consensusNodesCount: number,
  ): Promise<void> {
    const portForwarder: ExtendedNetServer = await MirrorNodeTest.forwardRestServicePort(contexts, namespace);
    try {
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
                `expect there to be ${consensusNodesCount} nodes in the mirror node's copy of the address book`,
              ).to.equal(consensusNodesCount);

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
        await MirrorNodeTest.stopPortForward(contexts, portForwarder);
      }
    }
  }

  private static async verifyPingerStatus(
    contexts: string[],
    namespace: NamespaceName,
    pingerIsEnabled: boolean,
  ): Promise<void> {
    const portForwarder: ExtendedNetServer = await MirrorNodeTest.forwardRestServicePort(contexts, namespace);
    try {
      const transactionsEndpoint: string = 'http://localhost:5551/api/v1/transactions';
      const firstResponse = await fetch(transactionsEndpoint);
      const firstData = await firstResponse.json();
      await sleep(Duration.ofSeconds(10));
      const secondResponse = await fetch(transactionsEndpoint);
      const secondData = await secondResponse.json();
      expect(firstData.transactions).to.not.be.undefined;
      expect(firstData.transactions.length).to.be.gt(0);
      expect(secondData.transactions).to.not.be.undefined;
      expect(secondData.transactions.length).to.be.gt(0);
      if (pingerIsEnabled) {
        expect(firstData.transactions[0]).to.not.deep.equal(secondData.transactions[0]);
      } else {
        expect(firstData.transactions[0]).to.deep.equal(secondData.transactions[0]);
      }
    } finally {
      if (portForwarder) {
        await MirrorNodeTest.stopPortForward(contexts, portForwarder);
      }
    }
  }

  public static deploy(options: BaseTestOptions): void {
    const {
      testName,
      testLogger,
      deployment,
      contexts,
      namespace,
      clusterReferenceNameArray,
      createdAccountIds,
      consensusNodesCount,
      pinger,
    } = options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful, verifyPingerStatus} = MirrorNodeTest;

    it(`${testName}: mirror node deploy`, async (): Promise<void> => {
      await main(soloMirrorNodeDeployArgv(testName, deployment, clusterReferenceNameArray[1], pinger));
      await verifyMirrorNodeDeployWasSuccessful(
        contexts,
        namespace,
        testLogger,
        createdAccountIds,
        consensusNodesCount,
      );
      await verifyPingerStatus(contexts, namespace, pinger);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  private static postgresPassword: string = 'XXXXXXX';
  private static postgresUsername: string = 'postgres';

  private static postgresReadonlyUsername: string = 'readonlyuser';
  private static postgresReadonlyPassword: string = 'XXXXXXXX';
  private static postgresHostFqdn: string = 'my-postgresql.database.svc.cluster.local';

  private static nameSpace: string = 'database';
  private static postgresName: string = 'my-postgresql';
  private static postgresContainerName: string = `${this.postgresName}-0`;
  private static postgresMirrorNodeDatabaseName: string = 'mirror_node';

  public static deployWithExternalDatabase(options: BaseTestOptions): void {
    const {
      testName,
      testLogger,
      deployment,
      contexts,
      namespace,
      clusterReferenceNameArray,
      createdAccountIds,
      consensusNodesCount,
      pinger,
    } = options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful, verifyPingerStatus, optionFromFlag} =
      MirrorNodeTest;

    it(`${testName}: mirror node deploy with external database`, async (): Promise<void> => {
      const argv = soloMirrorNodeDeployArgv(testName, deployment, clusterReferenceNameArray[1], pinger);

      // Add external database flags
      argv.push(
        optionFromFlag(Flags.enableIngress),
        optionFromFlag(Flags.useExternalDatabase),
        optionFromFlag(Flags.externalDatabaseHost),
        this.postgresHostFqdn,
        optionFromFlag(Flags.externalDatabaseOwnerUsername),
        this.postgresUsername,
        optionFromFlag(Flags.externalDatabaseOwnerPassword),
        this.postgresPassword,
        optionFromFlag(Flags.externalDatabaseReadonlyUsername),
        this.postgresReadonlyUsername,
        optionFromFlag(Flags.externalDatabaseReadonlyPassword),
        this.postgresReadonlyPassword,
      );

      await main(argv);
      await verifyMirrorNodeDeployWasSuccessful(
        contexts,
        namespace,
        testLogger,
        createdAccountIds,
        consensusNodesCount,
      );
      await verifyPingerStatus(contexts, namespace, pinger);
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('Enable port-forward for mirror node gRPC', async (): Promise<void> => {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(contexts[1]);
      const mirrorNodePods: Pod[] = await k8
        .pods()
        .list(namespace, [
          'app.kubernetes.io/instance=mirror',
          'app.kubernetes.io/name=grpc',
          'app.kubernetes.io/component=grpc',
        ]);
      const mirrorNodePod: Pod = mirrorNodePods[0];
      await k8.pods().readByReference(mirrorNodePod.podReference).portForward(5600, 5600);
    });
  }

  public static installPostgres(options: BaseTestOptions): void {
    const {contexts} = options;
    it('should install postgres chart', async (): Promise<void> => {
      await new ShellRunner().run(`kubectl config use-context "${contexts[1]}"`);
      const installPostgresChartCommand: string = `helm install my-postgresql https://charts.bitnami.com/bitnami/postgresql-12.1.2.tgz \
        --set image.tag=16.4.0 \
        --namespace ${this.nameSpace} --create-namespace \
        --set global.postgresql.auth.postgresPassword=${this.postgresPassword} \
        --set primary.persistence.enabled=false --set secondary.enabled=false`;

      await new ShellRunner().run(installPostgresChartCommand);

      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(contexts[1]);
      await k8
        .pods()
        .waitForReadyStatus(
          NamespaceName.of(this.nameSpace),
          ['app.kubernetes.io/name=postgresql'],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      const initScriptPath: string = 'examples/external-database-test/scripts/init.sh';

      // check if initScriptPath exist, otherwise throw error
      if (!fs.existsSync(initScriptPath)) {
        throw new Error(`Init script not found at path: ${initScriptPath}`);
      }

      const copyInitScriptCommand: string = `kubectl cp ${initScriptPath} ${this.postgresContainerName}:/tmp/init.sh -n ${this.nameSpace}`;
      await new ShellRunner().run(copyInitScriptCommand);

      const chmodInitScriptCommand: string = `kubectl exec -it ${this.postgresContainerName} -n ${this.nameSpace} -- chmod +x /tmp/init.sh`;
      await new ShellRunner().run(chmodInitScriptCommand);

      const initScriptCommand: string = `kubectl exec -it ${this.postgresContainerName} -n ${this.nameSpace} -- /bin/bash /tmp/init.sh "${this.postgresUsername}" "${this.postgresReadonlyUsername}" "${this.postgresReadonlyPassword}"`;
      await new ShellRunner().run(initScriptCommand);
    }).timeout(Duration.ofMinutes(2).toMillis());
  }

  public static runSql(options: BaseTestOptions): void {
    it('should run SQL command', async (): Promise<void> => {
      const {testCacheDirectory, testLogger} = options;
      const copySqlCommand: string = `kubectl cp ${testCacheDirectory}/database-seeding-query.sql ${this.postgresContainerName}:/tmp/database-seeding-query.sql -n ${this.nameSpace}`;
      await new ShellRunner().run(copySqlCommand);

      const runSqlCommand: string = `kubectl exec -it ${this.postgresContainerName} -n ${this.nameSpace} -- env PGPASSWORD=${this.postgresPassword} psql -U ${this.postgresUsername} -f /tmp/database-seeding-query.sql -d ${this.postgresMirrorNodeDatabaseName}`;
      await new ShellRunner().run(runSqlCommand);
    });
  }
}
