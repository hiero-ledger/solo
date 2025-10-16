// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe} from 'mocha';
import {expect} from 'chai';
import {sleep} from '../../../src/core/helpers.js';
import {container} from 'tsyringe-neo';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import * as TestUtilities from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {Duration} from '../../../src/core/time/duration.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import {TransactionToolCommandDefinition} from '../../../src/commands/command-definitions/transaction-tool-definition.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {type TransactionToolCommand} from '../../../src/commands/transaction-tool.js';
import {type ClusterReferenceName} from '../../../src/types/index.js';

const testName: string = 'transction tool-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const clusterReference: ClusterReferenceName = TestUtilities.getTestCluster();
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, clusterReference);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

TestUtilities.endToEndTestSuite(testName, argv, {}, (bootstrapResp): void => {
  describe('TransactionToolCommand', async (): Promise<void> => {
    const {
      opts: {k8Factory, commandInvoker, remoteConfig, configManager},
      cmd: {nodeCmd, networkCmd},
    } = bootstrapResp;

    let transactionToolCommand: TransactionToolCommand;

    before(async (): Promise<void> => {
      transactionToolCommand = container.resolve(InjectTokens.TransactionToolCommand);
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

    it("Should succeed deploying transaction tool with 'add' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: TransactionToolCommandDefinition.COMMAND_NAME,
        subcommand: TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_NAME,
        action: TransactionToolCommandDefinition.BACKEND_ADD,
        callback: async (argv): Promise<boolean> => transactionToolCommand.add(argv),
      });

      remoteConfig.configuration.components.getComponent(ComponentTypes.TransactionTools, 1);
    });

    TestUtilities.deployNetworkTest(argv, commandInvoker, networkCmd);

    TestUtilities.startNodesTest(argv, commandInvoker, nodeCmd);

    it('Should write log metrics', async (): Promise<void> => {
      await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
    });

    it("Should succeed with removing transaction tool with 'destroy' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(2).toMillis());

      configManager.reset();

      await commandInvoker.invoke({
        argv: argv,
        command: TransactionToolCommandDefinition.COMMAND_NAME,
        subcommand: TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_NAME,
        action: TransactionToolCommandDefinition.BACKEND_DESTROY,
        callback: async (argv): Promise<boolean> => transactionToolCommand.destroy(argv),
      });

      try {
        remoteConfig.configuration.components.getComponent(ComponentTypes.TransactionTools, 0);
        expect.fail();
      } catch (error) {
        expect(error).to.be.instanceof(SoloError);
      }
    });
  });
});
