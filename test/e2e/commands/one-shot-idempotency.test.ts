// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

import fs from 'node:fs';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import * as constants from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {OneShotIdempotencyLogCapture} from './tests/one-shot-idempotency-log-capture.js';
import {main} from '../../../src/index.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {Flags} from '../../../src/commands/flags.js';

// SOLO_FAIL_AFTER_STEP titles matching OrchestratorPipelinePhase titles in
// `DefaultOneShotDeployOrchestrator`. Injecting a failure after these phases lets us leave the
// deployment in a known partial state and then assert that a re-run resumes from the right place.
// const FAIL_AFTER_CONSENSUS_DEPLOY: string = 'Deploy consensus node';
// const FAIL_AFTER_NETWORK_NODE: string = 'Deploy network node';

const testName: string = 'one-shot-idempotency';
const testTitle: string = 'One Shot Idempotency Re-run Scenarios E2E Test';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;

      /**
       * Resets host and cluster to a clean slate so the next deploy behaves as a fresh install,
       * leaving every idempotency guard inactive.
       *
       * Tears down any existing deployment with `one-shot single destroy` first — this is the only
       * thing that removes the cluster-scoped state a prior scenario leaves behind (the
       * `pod-monitor-role` ClusterRole, the metrics-server, and the cluster-setup Helm release),
       * which deleting the namespace alone does not. Then it removes the on-disk state (local/remote
       * config cache, generated consensus keys, and the one-shot output directory that holds
       * `accounts.json`) so keys and accounts are regenerated. Finally it deletes the namespace and
       * the `pod-monitor-role` RBAC resources directly, as a fallback for a first run (or an aborted
       * prior run) where destroy has no deployment to act on.
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
            await k8Client.namespaces().delete(namespace);
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

      /**
       * Runs `one-shot single deploy`, capturing the `solo.log` text produced by this run and
       * returning the number of idempotency guards that fired (skipped steps). When
       * {@link failAfterStep} is provided, the SOLO_FAIL_AFTER_STEP hook injects a failure after
       * that phase so the deploy rejects mid-pipeline.
       */
      async function runDeploy(failAfterStep?: string): Promise<{skippedSteps: number; logContent: string}> {
        const logOffset: number = OneShotIdempotencyLogCapture.mark();
        if (failAfterStep) {
          process.env.SOLO_FAIL_AFTER_STEP = failAfterStep;
        }
        try {
          await main(soloOneShotDeploy(testName, deployment));
        } finally {
          delete process.env.SOLO_FAIL_AFTER_STEP;
        }
        const logContent: string = OneShotIdempotencyLogCapture.readSince(logOffset);
        return {skippedSteps: OneShotIdempotencyLogCapture.countSkippedSteps(logContent), logContent};
      }

      // async function expectDeployToFailAfter(failAfterStep: string): Promise<void> {
      //   const logOffset: number = OneShotIdempotencyLogCapture.mark();
      //   process.env.SOLO_FAIL_AFTER_STEP = failAfterStep;
      //   try {
      //     await expect(main(soloOneShotDeploy(testName, deployment))).to.be.rejectedWith(/Injected failure/i);
      //   } finally {
      //     delete process.env.SOLO_FAIL_AFTER_STEP;
      //   }
      //   // A fresh deploy that fails partway must not have tripped any idempotency guard.
      //   const logContent: string = OneShotIdempotencyLogCapture.readSince(logOffset);
      //   expect(OneShotIdempotencyLogCapture.countSkippedSteps(logContent)).to.equal(0);
      // }

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

      // Scenario 1: Fresh deploy — no prior configuration, every idempotency guard stays inactive.
      it(`${testName}: scenario 1 - fresh deploy leaves all guards inactive`, async (): Promise<void> => {
        const {skippedSteps} = await runDeploy();
        expect(skippedSteps, 'a fresh deploy should not skip any guarded step').to.equal(0);
      }).timeout(Duration.ofMinutes(30).toMillis());

      // Scenario 2: Re-run after full success — every guard activates and each step is bypassed.
      it(`${testName}: scenario 2 - re-run after full success skips every guarded step`, async (): Promise<void> => {
        const {skippedSteps} = await runDeploy();
        expect(skippedSteps, 're-running a complete deploy should skip every guarded step').to.equal(
          OneShotIdempotencyLogCapture.SKIP_REASONS.length,
        );
      }).timeout(Duration.ofMinutes(15).toMillis());

      // TODO: Enable with next phases
      // Scenario 3: Re-run after a consensus-deploy failure — the early steps are skipped and the
      // consensus setup/start continue from where the failed run stopped.
      // it(`${testName}: scenario 3 - re-run after consensus failure resumes setup`, async (): Promise<void> => {
      //   await cleanStart();
      //   await expectDeployToFailAfter(FAIL_AFTER_CONSENSUS_DEPLOY);
      //
      //   const {skippedSteps} = await runDeploy();
      //   expect(skippedSteps, 'the re-run should skip the steps completed before the consensus failure').to.equal(
      //     OneShotIdempotencyLogCapture.SKIP_REASONS.length,
      //   );
      // }).timeout(Duration.ofMinutes(45).toMillis());

      // Scenario 4: Re-run after a mirror-add failure — the consensus node persists while the mirror
      // (and remaining components) deployment proceeds.
      // it(`${testName}: scenario 4 - re-run after mirror failure keeps consensus and adds mirror`, async (): Promise<void> => {
      //   await cleanStart();
      //   await expectDeployToFailAfter(FAIL_AFTER_NETWORK_NODE);
      //
      //   const {skippedSteps} = await runDeploy();
      //   expect(skippedSteps, 'the re-run should skip the steps completed before the mirror failure').to.equal(
      //     OneShotIdempotencyLogCapture.SKIP_REASONS.length,
      //   );
      // }).timeout(Duration.ofMinutes(45).toMillis());
    });
  })
  .build();
endToEndTestSuite.runTestSuite();

export function soloOneShotDeploy(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
    optionFromFlag(Flags.deployment),
    deployment,
  );
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
