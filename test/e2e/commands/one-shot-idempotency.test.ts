// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

import fs from 'node:fs';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import * as constants from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {main} from '../../../src/index.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {Flags} from '../../../src/commands/flags.js';

const testName: string = 'one-shot-idempotency';
const testTitle: string = 'One Shot Re-run Scenarios E2E Test';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;

      const oneShotNamespace: NamespaceName = NamespaceName.of('one-shot');

      /**
       * Resets host and cluster to a clean slate so the first deploy behaves as a fresh install.
       *
       * Tears down any existing deployment with `one-shot single destroy` first — this is the only
       * thing that removes the cluster-scoped state a prior run leaves behind (the `pod-monitor-role`
       * ClusterRole, the metrics-server, and the cluster-setup Helm release), which deleting the
       * namespace alone does not. Then it removes the on-disk state (local/remote config cache,
       * generated consensus keys, and the one-shot output directory that holds `accounts.json`).
       * Finally it deletes the namespace and the `pod-monitor-role` RBAC resources directly, as a
       * fallback for a first run (or an aborted prior run) where destroy has no deployment to act on.
       */
      async function cleanStart(): Promise<void> {
        if (!fs.existsSync(testCacheDirectory)) {
          fs.mkdirSync(testCacheDirectory, {recursive: true});
        }
        // Point the container at this test's cache so destroy can resolve the deployment's local
        // config from a previous scenario, then tear it (and its cluster-scoped resources) down.
        resetForTest(namespace.name, testCacheDirectory, false);
        try {
          await main(soloOneShotDestroy(testName));
        } catch {
          // allowed to fail when there is no deployment to destroy (e.g. the very first run)
        }

        fs.rmSync(testCacheDirectory, {recursive: true, force: true});
        fs.rmSync(PathEx.join(constants.SOLO_CACHE_DIR, 'keys'), {recursive: true, force: true});
        fs.rmSync(PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${deployment}`), {recursive: true, force: true});
        try {
          fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {force: true});
        } catch {
          // allowed to fail if the file doesn't exist
        }
        fs.mkdirSync(testCacheDirectory, {recursive: true});
        resetForTest(namespace.name, testCacheDirectory, false);

        for (const item of contexts) {
          const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
          try {
            await k8Client.namespaces().delete(oneShotNamespace);
          } catch {
            // allowed to fail if the namespace doesn't exist
          }
          try {
            await k8Client.rbac().deleteClusterRoleBinding(constants.POD_MONITOR_ROLE);
          } catch {
            // allowed to fail if the cluster role binding doesn't exist
          }
          try {
            await k8Client.rbac().deleteClusterRole(constants.POD_MONITOR_ROLE);
          } catch {
            // allowed to fail if the cluster role doesn't exist
          }
        }
      }

      async function namespaceExists(): Promise<boolean> {
        for (const item of contexts) {
          const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
          if (await k8Client.namespaces().has(oneShotNamespace)) {
            return true;
          }
        }
        return false;
      }

      before(async (): Promise<void> => {
        await cleanStart();
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      after(async (): Promise<void> => {
        await main(soloDeploymentDiagnosticsLogs(testName, deployment));
        testLogger.info(`${testName}: beginning ${testName}: destroy`);
        await main(soloOneShotDestroy(testName));
        testLogger.info(`${testName}: finished ${testName}: destroy`);
      }).timeout(Duration.ofMinutes(10).toMillis());

      // Scenario 1: Fresh deploy from a clean slate produces a healthy deployment.
      it(`${testName}: scenario 1 - fresh deploy succeeds`, async (): Promise<void> => {
        await main(soloOneShotDeploy(testName, deployment));
        expect(await namespaceExists(), 'a fresh deploy should create the deployment namespace').to.be.true;
      }).timeout(Duration.ofMinutes(30).toMillis());

      // Scenario 2: Re-running over an existing deployment must clean it up first, but the cleanup
      // always requires interactive confirmation. With --force the prompt cannot be shown, so the
      // deploy is refused. Combined with --no-rollback, the refusal must not tear the existing
      // deployment down.
      it(`${testName}: scenario 2 - forced re-run is refused without destroying the deployment`, async (): Promise<void> => {
        await expect(main(soloOneShotDeploy(testName, deployment, {force: true, rollback: false}))).to.be.rejectedWith(
          /Confirmation required/i,
        );

        expect(await namespaceExists(), 'a refused re-run must leave the existing deployment intact').to.be.true;
      }).timeout(Duration.ofMinutes(15).toMillis());
    });
  })
  .build();
endToEndTestSuite.runTestSuite();

export function soloOneShotDeploy(
  testName: string,
  deployment: string,
  options: {force?: boolean; rollback?: boolean} = {},
): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
    optionFromFlag(Flags.deployment),
    deployment,
  );
  if (options.force === true) {
    argv.push(optionFromFlag(Flags.force));
  }
  if (options.rollback === false) {
    argv.push('--no-rollback');
  }
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloOneShotDestroy(testName: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DESTROY,
  );
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloDeploymentDiagnosticsLogs(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push('deployment', 'diagnostics', 'logs', optionFromFlag(Flags.deployment), deployment);
  argvPushGlobalFlags(argv, testName);
  return argv;
}
