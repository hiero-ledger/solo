// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE, SOLO_CACHE_DIR} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {sleep} from '../../../src/core/helpers.js';
import {Flags} from '../../../src/commands/flags.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';

const testName: string = 'performance-tests';
const testTitle: string = 'E2E Performance Tests';

const duration: number = 300; // 5 minutes
const clients: number = 5;
const accounts: number = 20;
const tokens: number = 1;
const nfts: number = 2;
const percent: number = 50;

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts} = options;

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

        testLogger.info(`${testName}: beginning ${testName}: deploy`);
        await main(soloOneShotDeploy(testName));
        testLogger.info(`${testName}: finished ${testName}: deploy`);
      }).timeout(Duration.ofMinutes(25).toMillis());

      after(async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: destroy`);
        await main(soloOneShotDestroy(testName));
        testLogger.info(`${testName}: finished ${testName}: destroy`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      it('CryptoTransferLoadTest', async (): Promise<void> => {
        await main(soloRapidFire(testName, 'CryptoTransferLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`));
      }).timeout(Duration.ofSeconds(duration * 2).toMillis());

      it('HCSLoadTest', async (): Promise<void> => {
        await main(soloRapidFire(testName, 'HCSLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`));
      }).timeout(Duration.ofSeconds(duration * 2).toMillis());

      it('NftTransferLoadTest', async (): Promise<void> => {
        await main(
          soloRapidFire(
            testName,
            'NftTransferLoadTest',
            `-c ${clients} -a ${accounts} -T ${nfts} -n ${accounts} -S flat -p ${percent} -R -t ${duration}`,
          ),
        );
      }).timeout(Duration.ofSeconds(duration * 2).toMillis());

      it('TokenTransferLoadTest', async (): Promise<void> => {
        await main(
          soloRapidFire(
            testName,
            'TokenTransferLoadTest',
            `-c ${clients} -a ${accounts} -T ${tokens} -A ${accounts} -R -t ${duration}`,
          ),
        );
      }).timeout(Duration.ofSeconds(duration * 2).toMillis());

      it('SmartContractLoadTest', async (): Promise<void> => {
        await main(soloRapidFire(testName, 'SmartContractLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`));
      }).timeout(Duration.ofSeconds(duration * 2).toMillis());

      it('Should write log metrics', async (): Promise<void> => {
        if (process.env.ONE_SHOT_METRICS_SLEEP_MINUTES) {
          const sleepTimeInMinutes: number = Number.parseInt(process.env.ONE_SHOT_METRICS_SLEEP_MINUTES, 10);

          if (Number.isNaN(sleepTimeInMinutes) || sleepTimeInMinutes <= 0) {
            throw new Error(
              `${testName}: invalid ONE_SHOT_METRICS_SLEEP_MINUTES value: ${process.env.ONE_SHOT_METRICS_SLEEP_MINUTES}`,
            );
          }

          for (let index: number = 0; index < sleepTimeInMinutes; index++) {
            console.log(`${testName}: sleeping for metrics collection, ${index + 1} of ${sleepTimeInMinutes} minutes`);
            await sleep(Duration.ofMinutes(1));
          }
        }

        const deploymentName: string = fs.readFileSync(
          PathEx.join(SOLO_CACHE_DIR, 'last-one-shot-deployment.txt'),
          'utf8',
        );
        const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
          InjectTokens.LocalConfigRuntimeState,
        );
        await localConfig.load();
        const deployment: Deployment = localConfig.configuration.deploymentByName(deploymentName);
        const namespace: string = deployment.namespace;
        await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${namespace}`));
      }).timeout(Duration.ofMinutes(60).toMillis());
    });
  })
  .build();
endToEndTestSuite.runTestSuite();

export function soloOneShotDeploy(testName: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
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

export function soloRapidFire(testName: string, performanceTest: string, argumentsString: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const deploymentName: string = fs.readFileSync(PathEx.join(SOLO_CACHE_DIR, 'last-one-shot-deployment.txt'), 'utf8');
  const argv: string[] = newArgv();
  argv.push(
    'rapid-fire',
    'load',
    'start',
    optionFromFlag(Flags.deployment),
    deploymentName,
    optionFromFlag(Flags.performanceTest),
    performanceTest,
    optionFromFlag(Flags.nlgArguments),
    `'"${argumentsString}"'`,
  );
  argvPushGlobalFlags(argv, testName);
  return argv;
}
