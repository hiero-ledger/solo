// SPDX-License-Identifier: Apache-2.0

import {after, describe} from 'mocha';

import {Duration} from '../../../src/core/time/duration.js';
import {testSeparateNodeAdd} from './separate-node-add.test.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster} from '../../test-utility.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version-test.js';
import {container} from 'tsyringe-neo';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {testSeparateNodeUpdate} from './separate-node-update.test.js';
import {testSeparateNodeDelete} from './separate-node-destroy.test.js';
import {ADD_EXECUTE_FLAGS} from '../../../src/commands/node/flags.js';

console.log(ADD_EXECUTE_FLAGS);

describe('Node add with hedera local build', (): void => {
  const localBuildPath: string = [
    'node1=../hiero-consensus-node/hedera-node/data/',
    '../hiero-consensus-node/hedera-node/data',
    'node3=../hiero-consensus-node/hedera-node/data',
  ].join(',');

  const suffix: string = localBuildPath.slice(0, 5);
  const namespace: NamespaceName = NamespaceName.of(`node-add${suffix}`);
  const argv: Argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.clusterRef, getTestCluster());
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
  argv.setArg(flags.stakeAmounts, '1500,1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.releaseTag, TEST_LOCAL_HEDERA_PLATFORM_VERSION);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.force, true);
  argv.setArg(flags.persistentVolumeClaims, true);
  argv.setArg(flags.localBuildPath, localBuildPath);
  argv.setArg(flags.forcePortForward, true);

  const timeout: number = Duration.ofMinutes(2).toMillis();

  endToEndTestSuite(namespace.name, argv, {}, (bootstrapResp): void => {
    const {
      opts: {k8Factory, commandInvoker, accountManager},
      cmd: {networkCmd},
    } = bootstrapResp;

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await accountManager.close();

      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NETWORK_DESTROY,
        callback: async (argv): Promise<boolean> => networkCmd.destroy(argv),
      });

      await k8Factory.default().namespaces().delete(namespace);
    });

    testSeparateNodeAdd(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeUpdate(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeDelete(argv.clone(), bootstrapResp, namespace);
  });
}).timeout(Duration.ofMinutes(3).toMillis());
