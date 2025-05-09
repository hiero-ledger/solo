// SPDX-License-Identifier: Apache-2.0

import {AccountId, PrivateKey, PublicKey} from '@hashgraph/sdk';
import {GenesisNetworkNodeDataWrapper} from './genesis-network-node-data-wrapper.js';
import * as constants from '../constants.js';

import {type KeyManager} from '../key-manager.js';
import {type ToJSON} from '../../types/index.js';
import {type JsonString, type NodeAlias} from '../../types/aliases.js';
import {GenesisNetworkRosterEntryDataWrapper} from './genesis-network-roster-entry-data-wrapper.js';
import {Templates} from '../templates.js';
import {SoloError} from '../errors/solo-error.js';
import {Flags as flags} from '../../commands/flags.js';
import {type AccountManager} from '../account-manager.js';
import {type ConsensusNode} from '../model/consensus-node.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type NodeServiceMapping} from '../../types/mappings/node-service-mapping.js';
import {type NetworkNodeServices} from '../network-node-services.js';

/**
 * Used to construct the nodes data and convert them to JSON
 */
export class GenesisNetworkDataConstructor implements ToJSON {
  public readonly nodes: Record<NodeAlias, GenesisNetworkNodeDataWrapper> = {};
  public readonly rosters: Record<NodeAlias, GenesisNetworkRosterEntryDataWrapper> = {};
  private readonly initializationPromise: Promise<void>;

  private constructor(
    private readonly consensusNodes: ConsensusNode[],
    private readonly keyManager: KeyManager,
    private readonly accountManager: AccountManager,
    private readonly keysDirectory: string,
    public networkNodeServiceMap: NodeServiceMapping,
    public adminPublicKeyMap: Map<NodeAlias, string>,
    public domainNamesMapping?: Record<NodeAlias, string>,
  ) {
    this.initializationPromise = (async () => {
      for (const consensusNode of consensusNodes) {
        let adminPubKey: PublicKey;
        const networkNodeService: NetworkNodeServices = this.networkNodeServiceMap.get(consensusNode.name);
        const accountId = AccountId.fromString(networkNodeService.accountId);
        const namespace = networkNodeService.namespace;

        if (adminPublicKeyMap.has(consensusNode.name as NodeAlias)) {
          try {
            if (PublicKey.fromStringED25519(adminPublicKeyMap[consensusNode.name])) {
              adminPubKey = adminPublicKeyMap[consensusNode.name];
            }
          } catch {
            // Ignore error
          }
        }

        // not found existing one, generate a new key, and save to k8 secret
        if (!adminPubKey) {
          const newKey = PrivateKey.generate();
          adminPubKey = newKey.publicKey;
          await this.accountManager.updateAccountKeys(namespace, accountId, newKey, true);
        }

        const nodeDataWrapper = new GenesisNetworkNodeDataWrapper(
          +networkNodeService.nodeId,
          adminPubKey,
          consensusNode.name,
        );
        this.nodes[consensusNode.name] = nodeDataWrapper;
        nodeDataWrapper.accountId = accountId;

        const rosterDataWrapper = new GenesisNetworkRosterEntryDataWrapper(+networkNodeService.nodeId);
        this.rosters[consensusNode.name] = rosterDataWrapper;
        rosterDataWrapper.weight = this.nodes[consensusNode.name].weight = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

        const externalPort = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
        // Add gossip endpoints
        nodeDataWrapper.addGossipEndpoint(networkNodeService.externalAddress, externalPort);
        rosterDataWrapper.addGossipEndpoint(networkNodeService.externalAddress, externalPort);

        const domainName = domainNamesMapping?.[consensusNode.name];

        // Add service endpoints
        nodeDataWrapper.addServiceEndpoint(domainName ?? networkNodeService.externalAddress, constants.GRPC_PORT);
      }
    })();
  }

  public static async initialize(
    consensusNodes: ConsensusNode[],
    keyManager: KeyManager,
    accountManager: AccountManager,
    keysDirectory: string,
    networkNodeServiceMap: NodeServiceMapping,
    adminPublicKeys: string[],
    domainNamesMapping?: Record<NodeAlias, string>,
  ): Promise<GenesisNetworkDataConstructor> {
    const adminPublicKeyMap: Map<NodeAlias, string> = new Map();

    const adminPublicKeyIsDefaultValue =
      adminPublicKeys.length === 1 && adminPublicKeys[0] === flags.adminPublicKeys.definition.defaultValue;
    // If admin keys are passed and if it is not the default value from flags then validate and build the adminPublicKeyMap
    if (adminPublicKeys.length > 0 && !adminPublicKeyIsDefaultValue) {
      if (adminPublicKeys.length !== consensusNodes.length) {
        throw new SoloError(
          `Provide a comma separated list of DER encoded ED25519 public keys for each node, adminPublicKeys.length=${adminPublicKeys.length} does not match consensusNodes.length=${consensusNodes.length}`,
        );
      }

      for (const [index, key] of adminPublicKeys.entries()) {
        adminPublicKeyMap[consensusNodes[index].name] = key;
      }
    }

    const instance = new GenesisNetworkDataConstructor(
      consensusNodes,
      keyManager,
      accountManager,
      keysDirectory,
      networkNodeServiceMap,
      adminPublicKeyMap,
      domainNamesMapping,
    );

    await instance.load();

    return instance;
  }

  /**
   * Loads the gossipCaCertificate and grpcCertificateHash
   */
  private async load() {
    await this.initializationPromise;
    await Promise.all(
      this.consensusNodes.map(async consensusNode => {
        const signingCertFile = Templates.renderGossipPemPublicKeyFile(consensusNode.name as NodeAlias);
        const signingCertFullPath = PathEx.joinWithRealPath(this.keysDirectory, signingCertFile);
        const derCertificate = this.keyManager.getDerFromPemCertificate(signingCertFullPath);

        //* Assign the DER formatted certificate
        this.rosters[consensusNode.name].gossipCaCertificate = this.nodes[consensusNode.name].gossipCaCertificate =
          Buffer.from(derCertificate).toString('base64');

        //* Generate the SHA-384 hash
        this.nodes[consensusNode.name].grpcCertificateHash = '';
      }),
    );
  }

  public toJSON(): JsonString {
    const nodeMetadata = [];
    for (const nodeAlias of Object.keys(this.nodes)) {
      nodeMetadata.push({
        node: this.nodes[nodeAlias].toObject(),
        rosterEntry: this.rosters[nodeAlias].toObject(),
      });
    }

    return JSON.stringify({nodeMetadata: nodeMetadata});
  }
}
