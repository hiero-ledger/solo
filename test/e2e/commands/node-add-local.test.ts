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
import {testSeparateNodeUpgrade} from './separate-node-upgrade.test.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {main} from '../../../src/index.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

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

    it('Should create and update a file', async (): Promise<void> => {
      const {newArgv} = BaseCommandTest;
      const testCacheDirectory = `./test-cache/${namespace.name}`;

      try {
        // Create a test file
        const testContent = 'Hello, Hedera! ' + randomBytes(8).toString('hex');
        const testFilePath = path.join(testCacheDirectory, 'test-file.txt');
        await fs.mkdir(path.dirname(testFilePath), {recursive: true});
        await fs.writeFile(testFilePath, testContent, 'utf8');

        // Create file on Hedera
        const createArguments = newArgv();
        BaseCommandTest.argvPushGlobalFlags(createArguments, namespace.name);
        createArguments.push(
          'file',
          'create',
          '--file-path',
          testFilePath,
          '--deployment',
          `${namespace.name}-deployment`,
        );

        await main(createArguments);

        // Update the file with new content
        const updatedContent = 'Updated content ' + randomBytes(8).toString('hex');
        const updatedFilePath = path.join(testCacheDirectory, 'test-file-updated.txt');
        await fs.writeFile(updatedFilePath, updatedContent, 'utf8');

        const updateArguments = newArgv();
        BaseCommandTest.argvPushGlobalFlags(updateArguments, namespace.name);
        updateArguments.push(
          'file',
          'update',
          '--file-id',
          '0.0.150',
          '--file-path',
          updatedFilePath,
          '--deployment',
          `${namespace.name}-deployment`,
        );

        await main(updateArguments);

        // Clean up test files
        try {
          await Promise.all([fs.unlink(testFilePath).catch(() => {}), fs.unlink(updatedFilePath).catch(() => {})]);
        } catch {
          // Ignore cleanup errors
        }
      } catch (error) {
        console.error('File operation test failed', error);
        throw error;
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    testSeparateNodeAdd(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeUpdate(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeUpgrade(argv.clone(), bootstrapResp, namespace);
    testSeparateNodeDelete(argv.clone(), bootstrapResp, namespace);
  });
}).timeout(Duration.ofMinutes(3).toMillis());
