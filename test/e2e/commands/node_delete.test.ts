// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../src/core/kube/resources/pod/pod_ref.js';
import {ContainerRef} from '../../../src/core/kube/resources/container/container_ref.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import {type Pod} from '../../../src/core/kube/resources/pod/pod.js';

const namespace = NamespaceName.of('node-delete');
const deleteNodeAlias = 'node1';
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.nodeAlias, deleteNodeAlias);
argv.setArg(flags.stakeAmounts, '1,1000');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.quiet, true);

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node delete', async () => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const k8Factory = bootstrapResp.opts.k8Factory;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv.build());
      expect(status).to.be.ok;
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should delete a node from the network successfully', async () => {
      await nodeCmd.handlers.delete(argv.build());
      expect(nodeCmd.configManager.getUnusedConfigs(NodeCommandConfigs.DELETE_CONFIGS_NAME)).to.deep.equal([
        flags.devMode.constName,
        flags.force.constName,
        flags.quiet.constName,
      ]);

      await bootstrapResp.opts.accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, deleteNodeAlias);

    accountCreationShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, deleteNodeAlias);

    it('deleted consensus node should not be running', async () => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of nodeAlias
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const response = await k8Factory
        .default()
        .containers()
        .readByRef(ContainerRef.of(PodRef.of(namespace, pods[0].podRef.name), ROOT_CONTAINER))
        .execContainer(['bash', '-c', `tail -n 1 ${HEDERA_HAPI_PATH}/output/swirlds.log`]);
      expect(response).to.contain('JVM is shutting down');
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
});
