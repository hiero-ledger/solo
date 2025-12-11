// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version-test.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import fs from 'node:fs';
import {main} from '../../../src/index.js';

const namespace = NamespaceName.of('local-ptt-app');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());

console.log('Starting local build for Platform app');
argv.setArg(
  flags.localBuildPath,
  '../hiero-consensus-node/platform-sdk/sdk/data,node1=../hiero-consensus-node/platform-sdk/sdk/data,node2=../hiero-consensus-node/platform-sdk/sdk/data',
);
argv.setArg(
  flags.appConfig,
  '../hiero-consensus-node/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json',
);

argv.setArg(flags.app, 'PlatformTestingTool.jar');
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, TEST_LOCAL_HEDERA_PLATFORM_VERSION);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node for platform app should start successfully', () => {
    const {
      opts: {k8Factory},
    } = bootstrapResp;
    const deploymentName: string = `${namespace.name}-deployment`;
    const backupDirectory: string = '/tmp/backup-test';

    after(async () => {
      fs.rmSync(backupDirectory, {recursive: true, force: true});
    });

    it('should create a backup of the deployment', async () => {
      const {newArgv} = BaseCommandTest;
      const backupCommandArguments: string[] = newArgv();
      backupCommandArguments.push(
        'config',
        'ops',
        'backup',
        '--deployment',
        deploymentName,
        '--output-dir',
        backupDirectory,
      );

      await main(backupCommandArguments);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('should restore from backup', async () => {
      const {newArgv} = BaseCommandTest;
      const restoreArguments: string[] = newArgv();
      restoreArguments.push(
        'config',
        'ops',
        'restore-config',
        '--deployment',
        deploymentName,
        '--input-dir',
        backupDirectory,
      );

      await main(restoreArguments);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('delete the namespace', async () => {
      await k8Factory.default().namespaces().delete(namespace);
    }).timeout(Duration.ofMinutes(2).toMillis());
  });
});
