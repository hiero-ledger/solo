// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
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
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const testName: string = 'one-shot-single';
const testTitle: string = 'One Shot Single E2E Test';
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
        // Remove test cache directory if it exists
        try {
          await fs.rm(testCacheDirectory, {recursive: true, force: true});
        } catch {
          // Ignore if directory doesn't exist
        }

        // Remove local config file if it exists
        try {
          await fs.rm(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
            force: true,
          });
        } catch {
          // allowed to fail if the file doesn't exist
        }

        // Create test cache directory if it doesn't exist
        try {
          await fs.mkdir(testCacheDirectory, {recursive: true});
        } catch (error) {
          if (error.code !== 'EEXIST') {
            throw error;
          }
        }
        resetForTest(namespace.name, testCacheDirectory, false);
        for (const item of contexts) {
          const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
          await k8Client.namespaces().delete(namespace);
        }
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      after(async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: destroy`);
        await main(soloOneShotDestroy(testName));

        // Clean up test files
        try {
          const testFilePath = path.join(testCacheDirectory, 'test-file.txt');
          const updatedFilePath = path.join(testCacheDirectory, 'test-file-updated.txt');

          for (const filePath of [testFilePath, updatedFilePath]) {
            try {
              await fs.access(filePath);
              await fs.unlink(filePath);
            } catch {
              // File doesn't exist or couldn't be deleted, which is fine
            }
          }
        } catch (error) {
          testLogger.warn('Failed to clean up test files', {error});
        }

        testLogger.info(`${testName}: finished ${testName}: destroy`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      // TODO pass in namespace for cache directory for proper destroy on restart
      it(`${testName}: deploy`, async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: deploy`);
        await main(soloOneShotDeploy(testName));
        testLogger.info(`${testName}: finished ${testName}: deploy`);
      }).timeout(Duration.ofMinutes(15).toMillis());

      it('Should write log metrics', async (): Promise<void> => {
        await sleep(Duration.ofMinutes(5)); // sleep 5 minutes for transactions to build up
        await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
      }).timeout(Duration.ofMinutes(10).toMillis());

      it('Should create and update a file', async (): Promise<void> => {
        testLogger.info(`${testName}: beginning file operations`);
        const {newArgv} = BaseCommandTest;

        try {
          // Create a test file
          const testContent = 'Hello, Hedera! ' + randomBytes(8).toString('hex');
          const testFilePath = path.join(testCacheDirectory, 'test-file.txt');
          await fs.writeFile(testFilePath, testContent, 'utf8');

          // Create file on Hedera
          const createArguments = newArgv();
          BaseCommandTest.argvPushGlobalFlags(createArguments, testName);
          createArguments.push(
            'file',
            'create',
            '--file-path',
            testFilePath,
            '--deployment',
            `${testName}-deployment`,
            '--namespace',
            namespace.name,
          );

          testLogger.info('Creating file on Hedera...');
          await main(createArguments);

          const fileId = '0.0.150';

          // Update the file with new content
          const updatedContent = 'Updated content ' + randomBytes(8).toString('hex');
          const updatedFilePath = path.join(testCacheDirectory, 'test-file-updated.txt');
          await fs.writeFile(updatedFilePath, updatedContent, 'utf8');

          const updateArguments = newArgv();
          BaseCommandTest.argvPushGlobalFlags(updateArguments, testName);
          updateArguments.push(
            'file',
            'update',
            '--file-id',
            fileId,
            '--file-path',
            updatedFilePath,
            '--deployment',
            `${testName}-deployment`,
            '--namespace',
            namespace.name,
          );

          testLogger.info('Updating file on Hedera...');
          await main(updateArguments);

          testLogger.info(`${testName}: Successfully created and updated file`);
        } catch (error) {
          testLogger.error('File operation test failed', {error});
          throw error;
        }
      }).timeout(Duration.ofMinutes(5).toMillis());
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
