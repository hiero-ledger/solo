// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  getTemporaryDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
  hederaPlatformSupportsNonZeroRealms,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'node:fs';
import {Zippy} from '../../../src/core/zippy.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {TEST_UPGRADE_VERSION} from '../../../version-test.js';
import {AccountId, AccountInfoQuery} from '@hashgraph/sdk';
import {type Container} from '../../../src/integration/kube/resources/container/container.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {Templates} from '../../../src/core/templates.js';
import {NodeStatusCodes} from '../../../src/core/enumerations.js';

const namespace = NamespaceName.of('node-upgrade');
const realm = 0;
const shard = hederaPlatformSupportsNonZeroRealms() ? 1 : 0;
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.realm, realm);
argv.setArg(flags.shard, shard);
const zipFile = 'upgrade.zip';

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, logger, accountManager, remoteConfig, cacheDir},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node upgrade', async () => {
    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    accountCreationShouldSucceed(
      accountManager,
      namespace,
      remoteConfig,
      logger,
      undefined,
      new AccountId(shard, realm, 1001),
    );

    it('should succeed with upgrade with new version', async () => {
      const upgradeWithVersionArgv: Argv = argv.clone();
      upgradeWithVersionArgv.setArg(flags.upgradeVersion, TEST_UPGRADE_VERSION);
      await commandInvoker.invoke({
        argv: upgradeWithVersionArgv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade',
        callback: async argv => nodeCmd.handlers.upgrade(argv),
      });
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async () => {
      // copy the version.txt file from the pod data/upgrade/current directory
      const temporaryDirectory = getTemporaryDirectory();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);

      const container: Container = k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER));

      await container.copyFrom(`${HEDERA_HAPI_PATH}/VERSION`, temporaryDirectory);
      const versionFile: string = fs.readFileSync(`${temporaryDirectory}/VERSION`, 'utf8');

      const versionLine: string = versionFile.split('\n')[0].trim();
      expect(versionLine).to.equal(`VERSION=${TEST_UPGRADE_VERSION.replace('v', '')}`);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('should succeed with upgrade with zip file', async () => {
      // Remove the staging directory to make sure the command works if it doesn't exist
      const stagingDirectory = Templates.renderStagingDir(cacheDir, argv.getArg<string>(flags.releaseTag));
      fs.rmSync(stagingDirectory, {recursive: true, force: true});

      const upgradeWithZipArgv: Argv = argv.clone();

      // Download application.properties from the pod
      const temporaryDirectory = getTemporaryDirectory();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const container: Container = k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER));
      await container.copyFrom(`${HEDERA_HAPI_PATH}/data/config/application.properties`, temporaryDirectory);

      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, 'application.properties');
      const applicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');
      const updatedContent: string = applicationProperties.replaceAll('contracts.chainId=298', 'contracts.chainId=299');
      fs.writeFileSync(applicationPropertiesPath, updatedContent);

      // create upgrade.zip file from tmp directory using zippy.ts
      const zipper: Zippy = new Zippy(logger);
      await zipper.zip(temporaryDirectory, zipFile);

      upgradeWithZipArgv.setArg(flags.upgradeZipFile, zipFile);

      await commandInvoker.invoke({
        argv: upgradeWithZipArgv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'upgrade',
        callback: async argv => nodeCmd.handlers.upgrade(argv),
      });

      const modifiedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

      await container.copyFrom(`${HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`, temporaryDirectory);
      const upgradedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

      expect(modifiedApplicationProperties).to.equal(upgradedApplicationProperties);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('all network pods should be running', async () => {
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const response: string = await container
        .resolve<NetworkNodes>(NetworkNodes)
        .getNetworkNodePodStatus(PodReference.of(namespace, pods[0].podReference.name));

      expect(response).to.not.be.undefined;
      const statusLine = response.split('\n').find(line => line.startsWith('platform_PlatformStatus'));
      expect(statusLine).to.not.be.undefined;
      const statusNumber = Number.parseInt(statusLine.split(' ').pop());
      expect(statusNumber).to.equal(NodeStatusCodes.ACTIVE, 'All network nodes are running');
    });

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

    accountCreationShouldSucceed(
      accountManager,
      namespace,
      remoteConfig,
      logger,
      undefined,
      new AccountId(shard, realm, 1002),
    );

    it('should validate created accounts', async () => {
      const accountInfo1 = await new AccountInfoQuery()
        .setAccountId(new AccountId(shard, realm, 1001))
        .execute(accountManager._nodeClient);
      expect(accountInfo1).not.to.be.null;

      const accountInfo2 = await new AccountInfoQuery()
        .setAccountId(new AccountId(shard, realm, 1002))
        .execute(accountManager._nodeClient);
      expect(accountInfo2).not.to.be.null;
    });
  });
});
