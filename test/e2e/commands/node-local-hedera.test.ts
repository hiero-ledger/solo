// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster, localHederaPlatformSupportsNonZeroRealms} from '../../test-utility.js';
import {sleep} from '../../../src/core/helpers.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {expect} from 'chai';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hiero-ledger/sdk';
import {Duration} from '../../../src/core/time/duration.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version-test.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type DeploymentName} from '../../../src/types/index.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

const namespace = NamespaceName.of('local-hedera-app');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.realm, 0);
argv.setArg(flags.shard, localHederaPlatformSupportsNonZeroRealms() ? 1023 : 0);

console.log('Starting local build for Hedera app');
argv.setArg(
  flags.localBuildPath,
  'node1=../hiero-consensus-node/hedera-node/data/,../hiero-consensus-node/hedera-node/data',
);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, TEST_LOCAL_HEDERA_PLATFORM_VERSION);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node for hedera app should have started successfully', () => {
    const {
      opts: {k8Factory, commandInvoker, remoteConfig},
      cmd: {nodeCmd, accountCmd},
      manager: {accountManager},
    } = bootstrapResp;

    it('save the state and restart the node with saved state', async () => {
      // create an account so later we can verify its balance after restart
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );
      const privateKey = PrivateKey.generate();
      // get random integer between 100 and 1000
      const amount = Math.floor(Math.random() * (1000 - 100) + 100);

      const newAccount = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      // Get the new account ID
      const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountInfo = {
        accountId: getReceipt.accountId.toString(),
        balance: amount,
      };

      // create more transactions to save more round of states
      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.ACCOUNT_CREATE,
        callback: async (argv): Promise<boolean> => accountCmd.create(argv),
      });

      await sleep(Duration.ofMillis(3));

      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.ACCOUNT_CREATE,
        callback: async (argv): Promise<boolean> => accountCmd.create(argv),
      });

      await sleep(Duration.ofMillis(3));

      // stop network and save the state
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_STOP,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.stop(argv),
      });

      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.STATE_DOWNLOAD,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.states(argv),
      });

      argv.setArg(flags.stateFile, PathEx.joinWithRealPath(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip'));

      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_START,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.start(argv),
      });

      // check balance of accountInfo.accountId
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

      const balance = await new AccountBalanceQuery()
        .setAccountId(accountInfo.accountId)
        .execute(accountManager._nodeClient);

      expect(balance.hbars).to.be.eql(Hbar.from(accountInfo.balance, HbarUnit.Hbar));
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('get the logs and delete the namespace', async () => {
      await accountManager.close();
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
});
