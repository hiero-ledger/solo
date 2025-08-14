// SPDX-License-Identifier: Apache-2.0

import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
  hederaPlatformSupportsNonZeroRealms,
  getTestCluster,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DeploymentName} from '../../../src/types/index.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {AccountCreateTransaction, AccountId, Hbar, HbarUnit, PrivateKey, TransferTransaction} from '@hashgraph/sdk';
import {main} from '../../../src/index.js';
import http from 'node:http';
import {sleep} from '../../../src/core/helpers.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-update');
const updateNodeId = 'node2';
const newAccountId = hederaPlatformSupportsNonZeroRealms() ? '1.1.7' : '0.0.7';
const deployment: DeploymentName = `${namespace.name}-deployment` as DeploymentName;
const argv = Argv.getDefaultArgv(namespace);

argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.nodeAlias, updateNodeId);
argv.setArg(flags.newAccountNumber, newAccountId);
argv.setArg(
  flags.newAdminKey,
  '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2',
);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.realm, hederaPlatformSupportsNonZeroRealms() ? 1 : 0);
argv.setArg(flags.shard, hederaPlatformSupportsNonZeroRealms() ? 1 : 0);
argv.setArg(flags.deployment, deployment);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, accountManager, remoteConfig, logger, keyManager},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node update', async () => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;
    let oldAccountId: string;
    let mirrorRestPortForward: any;
    const mirrorClusterReference = getTestCluster();

    function mirrorNodeDeployArguments(clusterReference: string): string[] {
      return [
        'node',
        'solo',
        'mirror-node',
        'deploy',
        '--deployment',
        deployment,
        '--cluster-ref',
        clusterReference,
        '--pinger',
        '--dev',
        '--quiet-mode',
      ];
    }

    async function deployMirrorNode(): Promise<void> {
      await main(mirrorNodeDeployArguments(mirrorClusterReference));

      const restPods = await k8Factory
        .getK8(mirrorClusterReference)
        .pods()
        .list(namespace, [
          'app.kubernetes.io/instance=mirror',
          'app.kubernetes.io/name=rest',
          'app.kubernetes.io/component=rest',
        ]);
      expect(restPods, 'mirror-node rest pod').to.have.lengthOf(1);

      // give REST a moment to start accepting connections
      await sleep(Duration.ofSeconds(5));
    }

    async function fetchMirrorNodes(): Promise<{nodes: unknown[]}> {
      return new Promise(resolve => {
        const request = http.request(
          'http://127.0.0.1:8081/api/v1/network/nodes',
          {method: 'GET', timeout: 5000, headers: {Connection: 'close'}},
          res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
              data += chunk;
            });
            res.on('end', () => {
              resolve(JSON.parse(data) as {nodes: unknown[]});
            });
          },
        );
        request.end();
      });
    }

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'stop',
        callback: async argv => nodeCmd.handlers.stop(argv),
      });

      await k8Factory.default().namespaces().delete(namespace);

      if (mirrorRestPortForward) {
        await k8Factory
          .getK8(mirrorClusterReference)
          .pods()
          .readByReference(null)
          .stopPortForward(mirrorRestPortForward);
      }
      await accountManager.close();
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
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async argv => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('record existing service-map and deploy mirror-node', async () => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      oldAccountId = existingServiceMap.get(updateNodeId).accountId;
      await deployMirrorNode();
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('initial mirror-node /network/nodes should contain old account-id', async () => {
      const resp = await fetchMirrorNodes();
      const accountIds = resp.nodes.map((n: any) => n.node_account_id ?? n.account_id);
      expect(accountIds).to.include(oldAccountId);
    }).timeout(defaultTimeout);

    it('should update a new node property successfully', async () => {
      // generate gossip and tls keys for the updated node
      const temporaryDirectory = getTemporaryDirectory();

      const signingKey = await keyManager.generateSigningKey(updateNodeId);
      const signingKeyFiles = await keyManager.storeSigningKey(updateNodeId, signingKey, temporaryDirectory);
      logger.debug(`generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`);
      argv.setArg(flags.gossipPublicKey, signingKeyFiles.certificateFile);
      argv.setArg(flags.gossipPrivateKey, signingKeyFiles.privateKeyFile);

      const tlsKey = await keyManager.generateGrpcTlsKey(updateNodeId);
      const tlsKeyFiles = await keyManager.storeTLSKey(updateNodeId, tlsKey, temporaryDirectory);
      logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
      argv.setArg(flags.tlsPublicKey, tlsKeyFiles.certificateFile);
      argv.setArg(flags.tlsPrivateKey, tlsKeyFiles.privateKeyFile);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'update',
        callback: async argv => nodeCmd.handlers.update(argv),
      });
    }).timeout(Duration.ofMinutes(30).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    it('signing key and tls key should not match previous one', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias);

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          if (
            nodeAlias === updateNodeId &&
            (keyFileName.startsWith(constants.SIGNING_KEY_PREFIX) || keyFileName.startsWith('hedera'))
          ) {
            expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).not.to.equal(
              `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
            );
          } else {
            expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
              `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
            );
          }
        }
      }
    }).timeout(defaultTimeout);

    it('the consensus nodes accountId should be the newAccountId', async () => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
      const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
      expect(accountId).to.equal(newAccountId);
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('mirror-node should now expose new account-id', async () => {
      let seen = false;
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts && !seen; attempt++) {
        const resp = await fetchMirrorNodes();
        const accountIds = new Set(resp.nodes.map((n: any) => n.node_account_id ?? n.account_id));
        if (accountIds.has(newAccountId) && !accountIds.has(oldAccountId)) {
          seen = true;
          break;
        }
        await sleep(Duration.ofSeconds(4));
      }
      expect(seen, 'mirror-node did not reflect account-id change in time').to.be.true;
    }).timeout(Duration.ofMinutes(4).toMillis());

    it('service-map should reflect the new account-id', async () => {
      const updatedMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const updatedIds = [...updatedMap.values()].map(s => s.accountId);
      expect(updatedIds).to.include(newAccountId);
      expect(updatedIds).to.not.include(oldAccountId);
    }).timeout(defaultTimeout);

    it('transaction directed at the NEW account-id should succeed', async () => {
      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        undefined,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const client: any = accountManager._nodeClient;
      const senderKey = PrivateKey.generate();
      const receiverKey = PrivateKey.generate();

      const senderId = await (async () => {
        const tx = await new AccountCreateTransaction()
          .setKey(senderKey)
          .setInitialBalance(Hbar.from(1000, HbarUnit.Hbar))
          .setNodeAccountIds([AccountId.fromString(newAccountId)])
          .freezeWith(client);
        await tx.sign(senderKey);
        const resp = await tx.execute(client);
        const receipt = await resp.getReceipt(client);
        return receipt.accountId;
      })();

      const receiverId = await (async () => {
        const tx = await new AccountCreateTransaction()
          .setKey(receiverKey)
          .setInitialBalance(Hbar.from(1, HbarUnit.Hbar))
          .setNodeAccountIds([AccountId.fromString(newAccountId)])
          .freezeWith(client);
        await tx.sign(receiverKey);
        const resp = await tx.execute(client);
        const receipt = await resp.getReceipt(client);
        return receipt.accountId;
      })();

      const transfer = await new TransferTransaction()
        .addHbarTransfer(senderId, Hbar.from(-1, HbarUnit.Hbar))
        .addHbarTransfer(receiverId, Hbar.from(1, HbarUnit.Hbar))
        .setNodeAccountIds([AccountId.fromString(newAccountId)])
        .freezeWith(client);
      await transfer.sign(senderKey);
      const txResp = await transfer.execute(client);
      await txResp.getReceipt(client);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('transaction directed at the OLD account-id should fail', async () => {
      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        undefined,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const client: any = accountManager._nodeClient;
      const key = PrivateKey.generate();
      const tx = await new AccountCreateTransaction()
        .setKey(key)
        .setInitialBalance(Hbar.from(1000, HbarUnit.Hbar))
        .setNodeAccountIds([AccountId.fromString(oldAccountId)])
        .freezeWith(client);
      await tx.sign(key);

      let threw = false;
      try {
        await tx.execute(client);
      } catch {
        threw = true;
      }
      expect(threw, 'expected transaction targeting old account-id to fail').to.be.true;
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
