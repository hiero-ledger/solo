// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName, type ExtendedNetServer} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
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
import {MirrorNodeCommand} from '../../../../src/commands/mirror-node.js';

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
      MirrorNodeCommand.COMMAND_NAME,
      MirrorNodeCommand.SUBCOMMAND_NAME,
      'add',
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
      await sleep(Duration.ofSeconds(2));
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

  public static add(options: BaseTestOptions): void {
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

    it(`${testName}: mirror node add`, async (): Promise<void> => {
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
}
