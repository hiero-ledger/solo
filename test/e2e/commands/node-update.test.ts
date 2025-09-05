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
  type BootstrapResponse,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {
  type DeploymentName,
  type NodeKeyObject,
  type PrivateKeyAndCertificateObject,
} from '../../../src/types/index.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {AccountCreateTransaction, AccountId, Hbar, HbarUnit, PrivateKey, TransferTransaction} from '@hiero-ledger/sdk';
import {main} from '../../../src/index.js';
import http from 'node:http';
import {sleep} from '../../../src/core/helpers.js';
import {type NetworkNodeServices} from '../../../src/core/network-node-services.js';

const defaultTimeout: number = Duration.ofMinutes(2).toMillis();
const namespace: NamespaceName = NamespaceName.of('node-update');
const updateNodeId: NodeAlias = 'node2';
const newAccountId: string = hederaPlatformSupportsNonZeroRealms() ? '1.1.7' : '0.0.7';
const deployment: DeploymentName = `${namespace.name}-deployment` as DeploymentName;
const argv: Argv = Argv.getDefaultArgv(namespace);

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

function mirrorNodeDeployArguments(clusterReference: string): string[] {
  return [
    'node',
    'solo',
    'mirror',
    'node',
    'add',
    '--deployment',
    deployment,
    '--cluster-ref',
    clusterReference,
    '--pinger',
    '--dev',
    '--quiet-mode',
    '--enable-ingress',
  ];
}

async function fetchMirrorNodes(): Promise<{nodes: unknown[]}> {
  return new Promise((resolve): void => {
    const request: http.ClientRequest = http.request(
      'http://127.0.0.1:8081/api/v1/network/nodes',
      {method: 'GET', timeout: 5000, headers: {Connection: 'close'}},
      (response: http.IncomingMessage): void => {
        let data: string = '';
        response.setEncoding('utf8');
        response.on('data', (chunk): void => {
          data += chunk;
        });
        response.on('end', (): void => {
          resolve(JSON.parse(data) as {nodes: unknown[]});
        });
      },
    );
    request.end();
  });
}

endToEndTestSuite(namespace.name, argv, {}, (bootstrapResp: BootstrapResponse): void => {
  const {
    opts: {k8Factory, commandInvoker, accountManager, remoteConfig, logger, keyManager},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node update', async (): Promise<void> => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;
    let oldAccountId: string;
    let mirrorRestPortForward: any;
    const mirrorClusterReference: string = getTestCluster();

    async function deployMirrorNode(): Promise<void> {
      await main(mirrorNodeDeployArguments(mirrorClusterReference));

      const restPods: Pod[] = await k8Factory
        .getK8(mirrorClusterReference)
        .pods()
        .list(namespace, [
          'app.kubernetes.io/instance=mirror-1',
          'app.kubernetes.io/name=rest',
          'app.kubernetes.io/component=rest',
        ]);
      expect(restPods, 'mirror-node rest pod').to.have.lengthOf(1);

      // give REST a moment to start accepting connections
      await sleep(Duration.ofSeconds(5));
    }

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);

      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_STOP,
        callback: (argv): Promise<boolean> => nodeCmd.handlers.stop(argv),
      });

      await k8Factory.default().namespaces().delete(namespace);

      if (mirrorRestPortForward) {
        await k8Factory
          .getK8(mirrorClusterReference)
          .pods()
          // eslint-disable-next-line unicorn/no-null
          .readByReference(null)
          .stopPortForward(mirrorRestPortForward);
      }
      await accountManager.close();
    });

    it('cache current version of private keys', async (): Promise<void> => {
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

    it('should succeed with init command', async (): Promise<void> => {
      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.SYSTEM_INIT,
        callback: (argv): Promise<boolean> => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('record existing service-map and deploy mirror-node', async (): Promise<void> => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      oldAccountId = existingServiceMap.get(updateNodeId).accountId;
      await deployMirrorNode();
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('initial mirror-node /network/nodes should contain old account-id', async (): Promise<void> => {
      const resp: {nodes: unknown[]} = await fetchMirrorNodes();
      const accountIds: any[] = resp.nodes.map((n: any): any => n.node_account_id ?? n.account_id);
      expect(accountIds).to.include(oldAccountId);
    }).timeout(defaultTimeout);

    it('should update a new node property successfully', async (): Promise<void> => {
      // generate gossip and tls keys for the updated node
      const temporaryDirectory: string = getTemporaryDirectory();

      const signingKey: NodeKeyObject = await keyManager.generateSigningKey(updateNodeId);
      const signingKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeSigningKey(
        updateNodeId,
        signingKey,
        temporaryDirectory,
      );
      logger.debug(`generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`);
      argv.setArg(flags.gossipPublicKey, signingKeyFiles.certificateFile);
      argv.setArg(flags.gossipPrivateKey, signingKeyFiles.privateKeyFile);

      const tlsKey: NodeKeyObject = await keyManager.generateGrpcTlsKey(updateNodeId);
      const tlsKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeTLSKey(
        updateNodeId,
        tlsKey,
        temporaryDirectory,
      );
      logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
      argv.setArg(flags.tlsPublicKey, tlsKeyFiles.certificateFile);
      argv.setArg(flags.tlsPrivateKey, tlsKeyFiles.privateKeyFile);

      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_UPDATE,
        callback: (argv): Promise<boolean> => nodeCmd.handlers.update(argv),
      });
    }).timeout(Duration.ofMinutes(30).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    it('signing key and tls key should not match previous one', async (): Promise<void> => {
      const currentNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>> = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap: Map<string, string> = currentNodeIdsPrivateKeysHash.get(nodeAlias);

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

    it('the consensus nodes accountId should be the newAccountId', async (): Promise<void> => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
      const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
      expect(accountId).to.equal(newAccountId);
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('mirror-node should now expose new account-id', async (): Promise<void> => {
      let seen: boolean = false;
      const maxAttempts: number = 30;
      for (let attempt: number = 0; attempt < maxAttempts && !seen; attempt++) {
        const resp: {nodes: unknown[]} = await fetchMirrorNodes();
        const accountIds: Set<any> = new Set(resp.nodes.map((n: any): any => n.node_account_id ?? n.account_id));
        if (accountIds.has(newAccountId) && !accountIds.has(oldAccountId)) {
          seen = true;
          break;
        }
        await sleep(Duration.ofSeconds(4));
      }
      expect(seen, 'mirror-node did not reflect account-id change in time').to.be.true;
    }).timeout(Duration.ofMinutes(4).toMillis());

    it('service-map should reflect the new account-id', async (): Promise<void> => {
      const updatedMap: NodeServiceMapping = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const updatedIds: string[] = [...updatedMap.values()].map((s: NetworkNodeServices): string => s.accountId);
      expect(updatedIds).to.include(newAccountId);
      expect(updatedIds).to.not.include(oldAccountId);
    }).timeout(defaultTimeout);

    it('transaction directed at the NEW account-id should succeed', async (): Promise<void> => {
      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        undefined,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const client: any = accountManager._nodeClient;
      const senderKey: PrivateKey = PrivateKey.generate();
      const receiverKey: PrivateKey = PrivateKey.generate();

      const senderId: AccountId = await (async (): Promise<any> => {
        const tx: AccountCreateTransaction = new AccountCreateTransaction()
          .setKeyWithoutAlias(senderKey)
          .setInitialBalance(Hbar.from(1000, HbarUnit.Hbar))
          .setNodeAccountIds([AccountId.fromString(newAccountId)])
          .freezeWith(client);
        await tx.sign(senderKey);
        const resp: any = await tx.execute(client);
        const receipt: any = await resp.getReceipt(client);
        return receipt.accountId;
      })();

      const receiverId: AccountId = await (async (): Promise<AccountId> => {
        const tx: AccountCreateTransaction = new AccountCreateTransaction()
          .setKeyWithoutAlias(receiverKey)
          .setInitialBalance(Hbar.from(1, HbarUnit.Hbar))
          .setNodeAccountIds([AccountId.fromString(newAccountId)])
          .freezeWith(client);
        await tx.sign(receiverKey);
        const resp: any = await tx.execute(client);
        const receipt: any = await resp.getReceipt(client);
        return receipt.accountId;
      })();

      const transfer: TransferTransaction = new TransferTransaction()
        .addHbarTransfer(senderId, Hbar.from(-1, HbarUnit.Hbar))
        .addHbarTransfer(receiverId, Hbar.from(1, HbarUnit.Hbar))
        .setNodeAccountIds([AccountId.fromString(newAccountId)])
        .freezeWith(client);
      await transfer.sign(senderKey);
      const txResp: any = await transfer.execute(client);
      await txResp.getReceipt(client);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('transaction directed at the OLD account-id should fail', async (): Promise<void> => {
      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        undefined,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const client: any = accountManager._nodeClient;
      const key: PrivateKey = PrivateKey.generate();
      const tx: AccountCreateTransaction = new AccountCreateTransaction()
        .setKeyWithoutAlias(key)
        .setInitialBalance(Hbar.from(1000, HbarUnit.Hbar))
        .setNodeAccountIds([AccountId.fromString(oldAccountId)])
        .freezeWith(client);
      await tx.sign(key);

      let threw: boolean = false;
      try {
        await tx.execute(client);
      } catch {
        threw = true;
      }
      expect(threw, 'expected transaction targeting old account-id to fail').to.be.true;
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
});
