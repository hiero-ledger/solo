// SPDX-License-Identifier: Apache-2.0

// New E2E test that performs a node account-id update via NodeUpdateTransaction
// and validates the change has propagated through the network, the mirror-node
// REST API, the SDK network configuration and fee distribution.

import {describe, it, after} from 'mocha';
import {expect} from 'chai';

import {
  endToEndTestSuite,
  balanceQueryShouldSucceed,
  accountCreationShouldSucceed,
  getTemporaryDirectory,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';

import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  AccountId,
  Hbar,
  HbarUnit,
  PrivateKey,
  TransferTransaction,
  Client,
} from '@hashgraph/sdk';
import {main} from '../../../src/index.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {sleep} from '../../../src/core/helpers.js';
import http from 'node:http';
import {type DeploymentName} from '../../../src/types/index.js';
import {type KeyManager} from '../../../src/core/key-manager.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-update-address-book');
const updateNodeAlias = 'node2';
const newAccountId = '0.0.7';

const deployment: DeploymentName = `${namespace.name}-deployment` as DeploymentName;

const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.nodeAlias, updateNodeAlias);
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
argv.setArg(flags.deployment, deployment);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, accountManager, remoteConfig, logger},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  // Local variables used across the test cases
  let existingServiceMap: NodeServiceMapping;
  let oldAccountId: string;
  let mirrorRestPortForward: any; // ExtendedNetServer, kept as any to avoid import churn

  const mirrorClusterRef = getTestCluster();

  /**
   * Helper – deploy mirror-node into the same namespace and wait until the REST
   * service is reachable.
   */
  function mirrorNodeDeployArgs(clusterRef: string): string[] {
    return [
      'node',
      'solo',
      'mirror-node',
      'deploy',
      '--deployment',
      deployment,
      '--cluster-ref',
      clusterRef,
      '--pinger',
      '--dev',
      '--quiet-mode',
    ];
  }

  async function deployMirrorNode(): Promise<void> {
    await main(mirrorNodeDeployArgs(mirrorClusterRef));

    const restPods = await k8Factory
      .getK8(mirrorClusterRef)
      .pods()
      .list(namespace, [
        'app.kubernetes.io/instance=mirror',
        'app.kubernetes.io/name=rest',
        'app.kubernetes.io/component=rest',
      ]);
    expect(restPods, 'mirror-node rest pod').to.have.lengthOf(1);

    mirrorRestPortForward = await k8Factory
      .getK8(mirrorClusterRef)
      .pods()
      .readByReference(restPods[0].podReference)
      .portForward(5551, 5551);

    // give REST a moment to start accepting connections
    await sleep(Duration.ofSeconds(5));
  }

  /**
   * Helper – query the mirror-node REST /network/nodes endpoint and return the
   * parsed JSON object.
   */
  async function fetchMirrorNodes(): Promise<{nodes: unknown[]}> {
    return new Promise(resolve => {
      const req = http.request(
        'http://127.0.0.1:5551/api/v1/network/nodes',
        {method: 'GET', timeout: 5_000, headers: {Connection: 'close'}},
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
      req.end();
    });
  }

  /**
   * Helper – create a new Hedera account on a given node.
   */
  async function createAccount(
    client: Client,
    key: PrivateKey,
    initialBalance: number,
    nodeAccountId: string,
  ): Promise<AccountId> {
    const tx = await new AccountCreateTransaction()
      .setKey(key)
      .setInitialBalance(Hbar.from(initialBalance, HbarUnit.Hbar))
      .setNodeAccountIds([AccountId.fromString(nodeAccountId)])
      .freezeWith(client);

    await tx.sign(key);
    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);
    return receipt.accountId;
  }

  describe('Node account-id update with mirror-node validation', () => {
    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      // Print node logs for easier debugging when the test fails
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await accountManager.close();
      if (mirrorRestPortForward) {
        // eslint-disable-next-line unicorn/no-null
        await k8Factory.getK8(mirrorClusterRef).pods().readByReference(null).stopPortForward(mirrorRestPortForward);
      }
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('record existing service-map and deploy mirror-node', async () => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      oldAccountId = existingServiceMap.get(updateNodeAlias).accountId;
      await deployMirrorNode();
    }).timeout(Duration.ofMinutes(12).toMillis());

    it('initial mirror-node /network/nodes should contain old account-id', async () => {
      const resp = await fetchMirrorNodes();
      const accountIds = resp.nodes.map(n => (n as any).node_account_id ?? (n as any).account_id);
      expect(accountIds).to.include(oldAccountId);
    }).timeout(defaultTimeout);

    it('run account init', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async a => accountCmd.init(a),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('perform node update (account-id change) successfully', async () => {
      // Generate fresh TLS & gossip keys for the updated node so that the
      // transaction contains certificate / gossip updates as well.
      const keyManager = container.resolve<KeyManager>(InjectTokens.KeyManager);
      const tmpDir = getTemporaryDirectory();

      const signingKey = await keyManager.generateSigningKey(updateNodeAlias);
      const signingFiles = await keyManager.storeSigningKey(updateNodeAlias, signingKey, tmpDir);
      argv.setArg(flags.gossipPublicKey, signingFiles.certificateFile);
      argv.setArg(flags.gossipPrivateKey, signingFiles.privateKeyFile);

      const tlsKey = await keyManager.generateGrpcTlsKey(updateNodeAlias);
      const tlsFiles = await keyManager.storeTLSKey(updateNodeAlias, tlsKey, tmpDir);
      argv.setArg(flags.tlsPublicKey, tlsFiles.certificateFile);
      argv.setArg(flags.tlsPrivateKey, tlsFiles.privateKeyFile);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'update',
        callback: async a => nodeCmd.handlers.update(a),
      });
    }).timeout(Duration.ofMinutes(30).toMillis());

    // Basic sanity – queries & account create should still succeed
    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeAlias);
    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeAlias);

    // Mirror-node should now show the NEW account-id and no longer list the old
    it('mirror-node should now expose new account-id', async () => {
      // wait until mirror node processes the address-book update
      let seen = false;
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts && !seen; attempt++) {
        const resp = await fetchMirrorNodes();
        const accountIds = resp.nodes.map(n => (n as any).node_account_id ?? (n as any).account_id);
        if (accountIds.includes(newAccountId) && !accountIds.includes(oldAccountId)) {
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
      const updatedIds = Array.from(updatedMap.values()).map(s => s.accountId);
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
      const client = accountManager._nodeClient;
      const senderKey = PrivateKey.generate();
      const receiverKey = PrivateKey.generate();

      const senderId = await createAccount(client, senderKey, 1000, newAccountId);
      const receiverId = await createAccount(client, receiverKey, 1, newAccountId);

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
      const client = accountManager._nodeClient;
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

    it('mirror-node should show charged fees for a transfer', async () => {
      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        undefined,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      const client = accountManager._nodeClient;

      // create two accounts: sender (1000 ℏ) and receiver (1 ℏ)
      const senderKey = PrivateKey.generate();
      const receiverKey = PrivateKey.generate();

      const senderId = await createAccount(client, senderKey, 1000, newAccountId);
      const receiverId = await createAccount(client, receiverKey, 1, newAccountId);

      const transfer = await new TransferTransaction()
        .addHbarTransfer(senderId, Hbar.from(-1, HbarUnit.Hbar))
        .addHbarTransfer(receiverId, Hbar.from(1, HbarUnit.Hbar))
        .setNodeAccountIds([AccountId.fromString(newAccountId)])
        .freezeWith(client);
      await transfer.sign(senderKey);
      const response = await transfer.execute(client);

      const firstTxIdSdkFormat = response.transactionId.toString();
      const [accPart, tsPart] = firstTxIdSdkFormat.split('@');
      const [secondsPart, nanosPart] = tsPart.split('.');
      const firstTxId = `${accPart}-${secondsPart}-${nanosPart}`;
      await response.getReceipt(client);

      // Poll mirror-node until the transfer appears and verify fee + receiver
      let feeSeen = 0;
      let feeCreditedToNewAccount = false;
      const maxAttempts = 30;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const mirrorUrl = `http://127.0.0.1:5551/api/v1/transactions/${firstTxId}`;

        const {fee, credited} = await new Promise<{fee: number; credited: boolean}>(resolve => {
          const req = http.request(mirrorUrl, {method: 'GET', timeout: 5_000}, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
              try {
                const obj = JSON.parse(data);
                const tx = obj.transactions?.[0] ?? {};
                const chargedFee = tx.charged_tx_fee ?? 0;
                const credited = (tx.transfers ?? []).some((t: any) => t.account === newAccountId && t.amount > 0);
                resolve({fee: chargedFee, credited});
              } catch {
                resolve({fee: 0, credited: false});
              }
            });
          });
          req.on('error', () => resolve({fee: 0, credited: false}));
          req.end();
        });

        feeSeen = fee;
        feeCreditedToNewAccount = credited;

        if (feeSeen > 0 && feeCreditedToNewAccount) break;
        await sleep(Duration.ofSeconds(4));
      }

      expect(feeSeen).to.be.greaterThan(0);
      expect(feeCreditedToNewAccount, 'fee should be credited to the new node account').to.be.true;
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
}); 