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

export class MirrorNodeTest extends BaseCommandTest {
  private soloMirrorNodeDeployArgv(deployment: DeploymentName, clusterReference: ClusterReferenceName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = this;

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
    argvPushGlobalFlags(argv, true, true);
    return argv;
  }

  private async verifyMirrorNodeDeployWasSuccessful(
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

  public deploy(): void {
    const {testName, testLogger, deployment, contexts, namespace, clusterReferenceNameArray, createdAccountIds} =
      this.options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful} = this;
    const soloMirrorNodeDeployArgvBound: (
      deployment: DeploymentName,
      clusterReference: ClusterReferenceName,
    ) => string[] = soloMirrorNodeDeployArgv.bind(this, deployment);

    it(`${testName}: mirror node deploy`, async (): Promise<void> => {
      await main(soloMirrorNodeDeployArgvBound(deployment, clusterReferenceNameArray[1]));
      await verifyMirrorNodeDeployWasSuccessful(contexts, namespace, testLogger, createdAccountIds);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }
}
