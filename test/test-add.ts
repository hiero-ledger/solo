// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, after} from 'mocha';

import {Flags as flags} from '../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
} from './test-utility.js';
import {type NodeAlias} from '../src/types/aliases.js';
import {Duration} from '../src/core/time/duration.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../version-test.js';
import {NamespaceName} from '../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../src/core/dependency-injection/inject-tokens.js';
import {Argv} from './helpers/argv-wrapper.js';
import {type DeploymentName} from '../src/types/index.js';
import {type NodeServiceMapping} from '../src/types/mappings/node-service-mapping.js';
import {Templates} from '../src/core/templates.js';
import fs from 'node:fs';
import {ConsensusCommandDefinition} from '../src/commands/command-definitions/consensus-command-definition.js';
import {LedgerCommandDefinition} from '../src/commands/command-definitions/ledger-command-definition.js';

const defaultTimeout: number = Duration.ofMinutes(2).toMillis();

export function testNodeAdd(
  localBuildPath: string,
  testDescription = 'Node add should success',
  timeout: number = defaultTimeout,
): void {
  const suffix = localBuildPath.slice(0, 5);
  const namespace = NamespaceName.of(`node-add${suffix}`);
  const argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
  argv.setArg(flags.stakeAmounts, '1500,1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv.setArg(
    flags.releaseTag,
    !localBuildPath || localBuildPath === '' ? HEDERA_PLATFORM_VERSION_TAG : TEST_LOCAL_HEDERA_PLATFORM_VERSION,
  );
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.force, true);
  argv.setArg(flags.persistentVolumeClaims, true);
  argv.setArg(flags.localBuildPath, localBuildPath);
  argv.setArg(flags.realm, 0);
  argv.setArg(flags.shard, 0);

  endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
    const {
      opts: {k8Factory, accountManager, remoteConfig, logger, commandInvoker, cacheDir},
      cmd: {nodeCmd, accountCmd, networkCmd},
    } = bootstrapResp;

    describe(testDescription, async () => {
      let existingServiceMap: NodeServiceMapping;
      let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

      after(async function () {
        this.timeout(Duration.ofMinutes(10).toMillis());

        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await accountManager.close();

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
          subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
          action: ConsensusCommandDefinition.NETWORK_DESTROY,
          callback: async (argv): Promise<boolean> => networkCmd.destroy(argv),
        });
        await k8Factory.default().namespaces().delete(namespace);
      });

      it('cache current version of private keys', async () => {
        existingServiceMap = await accountManager.getNodeServiceMap(
          namespace,
          remoteConfig.getClusterRefs(),
          argv.getArg<DeploymentName>(flags.deployment),
        );
        existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
          existingServiceMap,
          k8Factory,
          getTemporaryDirectory(),
        );
      }).timeout(defaultTimeout);

      it('should succeed with init command', async () => {
        await commandInvoker.invoke({
          argv: argv,
          command: LedgerCommandDefinition.COMMAND_NAME,
          subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
          action: LedgerCommandDefinition.SYSTEM_INIT,
          callback: async (argv): Promise<boolean> => accountCmd.init(argv),
        });
      }).timeout(Duration.ofMinutes(8).toMillis());

      it('should add a new node to the network successfully', async () => {
        // staging directory does not need to exist
        const stagingDirectory = Templates.renderStagingDir(cacheDir, argv.getArg<string>(flags.releaseTag));
        fs.rmSync(stagingDirectory, {recursive: true, force: true});

        await commandInvoker.invoke({
          argv: argv,
          command: ConsensusCommandDefinition.COMMAND_NAME,
          subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
          action: ConsensusCommandDefinition.NODE_ADD,
          callback: async (argv): Promise<boolean> => nodeCmd.handlers.add(argv),
        });

        argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
        await accountManager.close();
      }).timeout(Duration.ofMinutes(12).toMillis());

      it('should be able to create account after a consensus node add', async () => {
        await commandInvoker.invoke({
          argv: argv,
          command: LedgerCommandDefinition.COMMAND_NAME,
          subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
          action: LedgerCommandDefinition.ACCOUNT_CREATE,
          callback: async (argv): Promise<boolean> => accountCmd.create(argv),
        });
      });

      balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

      accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);

      it('existing nodes private keys should not have changed', async () => {
        const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
          existingServiceMap,
          k8Factory,
          getTemporaryDirectory(),
        );

        for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
          const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias);

          for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
            expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.deep.equal(
              `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
            );
          }
        }
      }).timeout(timeout);
    });
  });
}
