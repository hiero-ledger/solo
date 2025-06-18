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
import {type PackageDownloader} from '../../../../src/core/package-downloader.js';
import http from 'node:http';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';

export class ExplorerTest extends BaseCommandTest {
  private static soloExplorerDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ExplorerTest;

    const argv: string[] = newArgv();
    argv.push(
      'explorer',
      'deploy',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static async verifyExplorerDeployWasSuccessful(
    contexts: string[],
    namespace: NamespaceName,
    createdAccountIds: string[],
    testLogger: SoloLogger,
  ): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[1]);
    const explorerPods: Pod[] = await k8
      .pods()
      .list(namespace, [
        'app.kubernetes.io/instance=hiero-explorer',
        'app.kubernetes.io/name=hiero-explorer-chart',
        'app.kubernetes.io/component=hiero-explorer',
      ]);
    expect(explorerPods).to.have.lengthOf(1);
    let portForwarder: ExtendedNetServer;
    try {
      portForwarder = await k8.pods().readByReference(explorerPods[0].podReference).portForward(8080, 8080);
      await sleep(Duration.ofSeconds(2));
      const queryUrl: string = 'http://127.0.0.1:8080/api/v1/accounts?limit=15&order=desc';
      const packageDownloader: PackageDownloader = container.resolve<PackageDownloader>(InjectTokens.PackageDownloader);
      expect(await packageDownloader.urlExists(queryUrl), 'the hedera explorer Accounts URL should exist').to.be.true;

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
              const object: {accounts: {account: string}[]} = JSON.parse(chunk);
              expect(
                object.accounts?.length,
                "expect there to be more than one account in the hedera explorer's call to mirror node",
              ).to.be.greaterThan(1);

              for (const accountId of createdAccountIds) {
                expect(
                  object.accounts.some((account: {account: string}): boolean => account.account === accountId),
                  `expect ${accountId} to be in the response`,
                ).to.be.true;
              }

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
    } finally {
      if (portForwarder) {
        // eslint-disable-next-line unicorn/no-null
        await k8.pods().readByReference(null).stopPortForward(portForwarder);
      }
    }
  }

  public static deploy(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray, testLogger, createdAccountIds} =
      options;
    const {soloExplorerDeployArgv, verifyExplorerDeployWasSuccessful} = ExplorerTest;

    it(`${testName}: explorer deploy`, async (): Promise<void> => {
      await main(soloExplorerDeployArgv(testName, deployment, clusterReferenceNameArray[1]));
      await verifyExplorerDeployWasSuccessful(contexts, namespace, createdAccountIds, testLogger);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
