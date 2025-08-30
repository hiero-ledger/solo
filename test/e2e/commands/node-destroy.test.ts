// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  HEDERA_PLATFORM_VERSION_TAG,
  hederaPlatformSupportsNonZeroRealms,
} from '../../test-utility.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {AccountId} from '@hiero-ledger/sdk';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

const namespace = NamespaceName.of('node-delete');
const deleteNodeAlias = 'node1';
const updateNodeAlias = 'node2';
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.nodeAlias, deleteNodeAlias);
argv.setArg(flags.stakeAmounts, '1,1000');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.realm, hederaPlatformSupportsNonZeroRealms() ? 65_535 : 0);
argv.setArg(flags.shard, 0);

let updateAccountId: AccountId;
let updateAccountPrivateKey: string;

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node delete', async () => {
    const {
      opts: {k8Factory, commandInvoker, accountManager, remoteConfig, logger},
      cmd: {nodeCmd, accountCmd},
    } = bootstrapResp;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('should succeed with init command', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.SYSTEM_INIT,
        callback: async (argv): Promise<boolean> => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should delete a node from the network successfully', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_DESTROY,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.destroy(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('should be able to create account after a consensus node destroy', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.ACCOUNT_CREATE,
        callback: async (argv): Promise<boolean> => accountCmd.create(argv),
      });

      // Create a new account to update the node account id
      // @ts-expect-error - TS2341: to access private property
      const newAccountInfo = accountCmd.accountInfo;
      updateAccountId = AccountId.fromString(newAccountInfo.accountId);
      updateAccountPrivateKey = newAccountInfo.privateKey;
    });

    it('should be able to update a node after consensus node destroy', async () => {
      argv.setArg(flags.newAccountNumber, updateAccountId.toString());
      argv.setArg(flags.nodeAlias, updateNodeAlias);
      argv.setArg(flags.newAdminKey, updateAccountPrivateKey);
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_UPDATE,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.update(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(30).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, deleteNodeAlias);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, deleteNodeAlias);

    it('deleted consensus node should not be running', async () => {
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, ['solo.hedera.com/type=network-node', `solo.hedera.com/node-name=${deleteNodeAlias}`]);
      expect(pods.length).to.equal(1);

      const response = await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER))
        .execContainer(['bash', '-c', `tail -n 1 ${HEDERA_HAPI_PATH}/output/swirlds.log`]);
      expect(response).to.contain('JVM is shutting down');
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
});
