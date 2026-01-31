// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {
  Client,
  AccountId,
  PrivateKey,
  Hbar,
  TransferTransaction,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {Flags} from '../../../src/commands/flags.js';
import {HelmMetricsServer} from '../../helpers/helm-metrics-server.js';
import {HelmMetalLoadBalancer} from '../../helpers/helm-metal-load-balancer.js';

const minimalSetup: boolean = process.env.SOLO_ONE_SHOT_MINIMAL_SETUP?.toLowerCase() === 'true';

const testName: string = minimalSetup ? 'one-shot-single-minimal' : 'one-shot-single';
const testTitle: string = 'One Shot Single E2E Test';
const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withMinimalSetup(process.env.SOLO_ONE_SHOT_MINIMAL_SETUP?.toLowerCase() === 'true')
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;

      // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
      before(async (): Promise<void> => {
        fs.rmSync(testCacheDirectory, {recursive: true, force: true});
        try {
          fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
            force: true,
          });
        } catch {
          // allowed to fail if the file doesn't exist
        }
        if (!fs.existsSync(testCacheDirectory)) {
          fs.mkdirSync(testCacheDirectory, {recursive: true});
        }
        resetForTest(namespace.name, testCacheDirectory, false);
        for (const item of contexts) {
          const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
          await k8Client.namespaces().delete(namespace);
        }
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      after(async (): Promise<void> => {
        await main(soloDeploymentDiagnosticsLogs(testName, deployment));
        testLogger.info(`${testName}: beginning ${testName}: destroy`);
        await main(soloOneShotDestroy(testName));
        testLogger.info(`${testName}: finished ${testName}: destroy`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      // TODO pass in namespace for cache directory for proper destroy on restart
      it(`${testName}: deploy`, async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: deploy`);
        await main(soloOneShotDeploy(testName, deployment, options.minimalSetup));
        testLogger.info(`${testName}: finished ${testName}: deploy`);
      }).timeout(Duration.ofMinutes(20).toMillis());

      it('Should perform a simple TransferTransaction', async (): Promise<void> => {
        // These should be set in your environment or test config
        const operatorId: AccountId = AccountId.fromString('0.0.2');
        const operatorKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        const recipientId: AccountId = AccountId.fromString('0.0.3');
        const client: Client = Client.forNetwork({'localhost:50211': '0.0.3'}).setOperator(operatorId, operatorKey);

        const tx: TransactionResponse = await new TransferTransaction()
          .addHbarTransfer(operatorId, new Hbar(-1))
          .addHbarTransfer(recipientId, new Hbar(1))
          .execute(client);

        const receipt: TransactionReceipt = await tx.getReceipt(client);
        if (receipt.status.toString() !== 'SUCCESS') {
          throw new Error(`TransferTransaction failed: ${receipt.status}`);
        }
      });

      it('Should write log metrics', async (): Promise<void> => {
        if (minimalSetup) {
          await HelmMetricsServer.installMetricsServer(testName);
          await HelmMetalLoadBalancer.installMetalLoadBalancer(testName);
        }

        await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
      }).timeout(Duration.ofMinutes(60).toMillis());

      // TODO add verifications
    });
  })
  .build();
endToEndTestSuite.runTestSuite();

export function soloOneShotDeploy(testName: string, deployment: string, minimalSetup: boolean): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.minimalSetup),
    minimalSetup ? 'true' : 'false',
  );
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloOneShotDestroy(testName: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push('one-shot', 'single', 'destroy');
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloDeploymentDiagnosticsLogs(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;
  const argv: string[] = newArgv();
  argv.push('deployment', 'diagnostics', 'logs', '--deployment', deployment);
  argvPushGlobalFlags(argv, testName);
  return argv;
}
