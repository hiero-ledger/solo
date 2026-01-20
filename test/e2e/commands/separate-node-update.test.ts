// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  type BootstrapResponse,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {
  type DeploymentName,
  type NodeKeyObject,
  type PrivateKeyAndCertificateObject,
} from '../../../src/types/index.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

export function testSeparateNodeUpdate(
  argv: Argv,
  bootstrapResp: BootstrapResponse,
  namespace: NamespaceName,
  timeout: number,
): void {
  const updateNodeId: NodeAlias = 'node2';
  const newAccountId: string = '0.0.7';
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.nodeAlias, updateNodeId);
  argv.setArg(flags.newAccountNumber, newAccountId);
  argv.setArg(
    flags.newAdminKey,
    '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2',
  );

  const {
    opts: {k8Factory, logger, remoteConfig, commandInvoker, accountManager, keyManager},
    cmd: {nodeCmd},
  } = bootstrapResp;

  describe('Node update via separated commands', async (): Promise<void> => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

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
    }).timeout(Duration.ofMinutes(8).toMillis());

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

      const temporaryDirectory2: string = 'contextDir';
      const argvPrepare: Argv = argv.clone();
      argvPrepare.setArg(flags.outputDir, temporaryDirectory2);

      const argvExecute: Argv = argv.clone();
      argvExecute.setArg(flags.inputDir, temporaryDirectory2);

      await commandInvoker.invoke({
        argv: argvPrepare,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_PREPARE,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.updatePrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.updateSubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_EXECUTE,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.updateExecute(argv),
      });

      await accountManager.close();
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
    }).timeout(timeout);

    it('the consensus nodes accountId should be the newAccountId', async (): Promise<void> => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
      const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
      expect(accountId).to.equal(newAccountId);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
}

// // SPDX-License-Identifier: Apache-2.0
//
// import {it, describe} from 'mocha';
// import {expect} from 'chai';
//
// import {Flags as flags} from '../../../src/commands/flags.js';
// import * as constants from '../../../src/core/constants.js';
// import {
//   accountCreationShouldSucceed,
//   balanceQueryShouldSucceed,
//   type BootstrapResponse,
//   getNodeAliasesPrivateKeysHash,
//   getTemporaryDirectory,
// } from '../../test-utility.js';
// import {Duration} from '../../../src/core/time/duration.js';
// import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
// import {type Argv} from '../../helpers/argv-wrapper.js';
// import {type NodeAlias} from '../../../src/types/aliases.js';
// import {
//   type DeploymentName,
//   type NodeKeyObject,
//   type PrivateKeyAndCertificateObject,
// } from '../../../src/types/index.js';
// import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
// import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
// import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
// import {main} from '../../../src/index.js';
// import {buildMainArgv} from '../../test-utility.js';
// import {type CommandFlag} from '../../../src/types/flag-types.js';
//
// export function testSeparateNodeUpdate(
//   argv: Argv,
//   bootstrapResp: BootstrapResponse,
//   namespace: NamespaceName,
//   timeout: number,
// ): void {
//   const updateNodeId: NodeAlias = 'node2';
//   const newAccountId: string = '0.0.7';
//   argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
//   argv.setArg(flags.nodeAlias, updateNodeId);
//   argv.setArg(flags.newAccountNumber, newAccountId);
//   argv.setArg(
//     flags.newAdminKey,
//     '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2',
//   );
//
//   const {
//     opts: {k8Factory, logger, remoteConfig, accountManager, keyManager},
//   } = bootstrapResp;
//
//   describe('Node update via separated commands', async (): Promise<void> => {
//     let existingServiceMap: NodeServiceMapping;
//     let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;
//
//     it('cache current version of private keys', async (): Promise<void> => {
//       existingServiceMap = await accountManager.getNodeServiceMap(
//         namespace,
//         remoteConfig.getClusterRefs(),
//         argv.getArg<DeploymentName>(flags.deployment),
//       );
//       existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
//         existingServiceMap,
//         k8Factory,
//         getTemporaryDirectory(),
//       );
//     }).timeout(Duration.ofMinutes(8).toMillis());
//
//     it('should update a new node property successfully', async (): Promise<void> => {
//       // generate gossip and tls keys for the updated node
//       const temporaryDirectory: string = getTemporaryDirectory();
//
//       const signingKey: NodeKeyObject = await keyManager.generateSigningKey(updateNodeId);
//       const signingKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeSigningKey(
//         updateNodeId,
//         signingKey,
//         temporaryDirectory,
//       );
//
//       logger.debug(`generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`);
//       argv.setArg(flags.gossipPublicKey, signingKeyFiles.certificateFile);
//       argv.setArg(flags.gossipPrivateKey, signingKeyFiles.privateKeyFile);
//
//       const tlsKey: NodeKeyObject = await keyManager.generateGrpcTlsKey(updateNodeId);
//       const tlsKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeTLSKey(
//         updateNodeId,
//         tlsKey,
//         temporaryDirectory,
//       );
//
//       logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
//       argv.setArg(flags.tlsPublicKey, tlsKeyFiles.certificateFile);
//       argv.setArg(flags.tlsPrivateKey, tlsKeyFiles.privateKeyFile);
//
//       const temporaryContextDirectory: string = 'contextDir';
//       await main(
//         buildMainArgv(
//           namespace.toString(),
//           ConsensusCommandDefinition.COMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_PREPARE,
//           new Map<CommandFlag, string>([
//             [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
//             [flags.outputDir, temporaryContextDirectory],
//             [flags.nodeAlias, argv.getArg<string>(flags.nodeAlias)],
//             [flags.cacheDir, argv.getArg<string>(flags.cacheDir)],
//             [flags.gossipPublicKey, argv.getArg<string>(flags.gossipPublicKey)],
//             [flags.gossipPrivateKey, argv.getArg<string>(flags.gossipPrivateKey)],
//             [flags.tlsPublicKey, argv.getArg<string>(flags.tlsPublicKey)],
//             [flags.tlsPrivateKey, argv.getArg<string>(flags.tlsPrivateKey)],
//             [flags.newAccountNumber, argv.getArg<string>(flags.newAccountNumber)],
//             [flags.newAdminKey, argv.getArg<string>(flags.newAdminKey)],
//           ]),
//         ),
//       );
//
//       await main(
//         buildMainArgv(
//           namespace.toString(),
//           ConsensusCommandDefinition.COMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
//           new Map<CommandFlag, string>([
//             [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
//             [flags.inputDir, temporaryContextDirectory],
//             [flags.cacheDir, argv.getArg<string>(flags.cacheDir)],
//           ]),
//         ),
//       );
//
//       await main(
//         buildMainArgv(
//           namespace.toString(),
//           ConsensusCommandDefinition.COMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
//           ConsensusCommandDefinition.DEV_NODE_EXECUTE,
//           new Map<CommandFlag, string>([
//             [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
//             [flags.inputDir, temporaryContextDirectory],
//             [flags.cacheDir, argv.getArg<string>(flags.cacheDir)],
//           ]),
//         ),
//       );
//
//       await accountManager.close();
//     }).timeout(Duration.ofMinutes(30).toMillis());
//
//     balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);
//
//     accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);
//
//     it('signing key and tls key should not match previous one', async (): Promise<void> => {
//       const currentNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>> = await getNodeAliasesPrivateKeysHash(
//         existingServiceMap,
//         k8Factory,
//         getTemporaryDirectory(),
//       );
//
//       for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
//         const currentNodeKeyHashMap: Map<string, string> = currentNodeIdsPrivateKeysHash.get(nodeAlias);
//
//         for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
//           if (
//             nodeAlias === updateNodeId &&
//             (keyFileName.startsWith(constants.SIGNING_KEY_PREFIX) || keyFileName.startsWith('hedera'))
//           ) {
//             expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).not.to.equal(
//               `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
//             );
//           } else {
//             expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
//               `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
//             );
//           }
//         }
//       }
//     }).timeout(timeout);
//
//     it('the consensus nodes accountId should be the newAccountId', async (): Promise<void> => {
//       // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
//       const pods: Pod[] = await k8Factory
//         .default()
//         .pods()
//         .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
//       const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
//       expect(accountId).to.equal(newAccountId);
//     }).timeout(Duration.ofMinutes(10).toMillis());
//   });
// }
