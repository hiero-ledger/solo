// SPDX-License-Identifier: Apache-2.0

import {X509Certificate} from 'node:crypto';
import fs from 'node:fs';
import {type ConsensusNode} from './model/consensus-node.js';
import {Templates} from './templates.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type NodeAlias} from '../types/aliases.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';

export interface BlockNodeRsaRosterNodeAddress {
  RSAPubKey: string;
  nodeId: number;
}

export interface BlockNodeRsaBootstrapRosterStructure {
  nodeAddress: BlockNodeRsaRosterNodeAddress[];
}

export class BlockNodeRsaBootstrapRoster {
  public static readBlockNodeRsaBootstrapRosterJsonFromFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
  }

  public static async buildBlockNodeRsaBootstrapRosterJsonFromSecrets(
    consensusNodes: ConsensusNode[],
    namespace: NamespaceName,
    context: string,
    k8Factory: K8Factory,
    logger: SoloLogger,
  ): Promise<string | undefined> {
    const nodeAddresses: BlockNodeRsaRosterNodeAddress[] = [];

    for (const consensusNode of consensusNodes) {
      const nodeAlias: NodeAlias = consensusNode.name as NodeAlias;
      const secretName: string = Templates.renderGossipKeySecretName(nodeAlias);
      const publicKeyFileName: string = Templates.renderGossipPemPublicKeyFile(nodeAlias);

      try {
        const secret: Secret = await k8Factory.getK8(context).secrets().read(namespace, secretName);
        const encodedPemCertificate: string | undefined = secret.data[publicKeyFileName];

        if (!encodedPemCertificate) {
          logger.warn(
            `Skipping RSA bootstrap roster entry for ${nodeAlias}: secret '${secretName}' does not contain '${publicKeyFileName}'.`,
          );
          continue;
        }

        const pemCertificate: string = Buffer.from(encodedPemCertificate, 'base64').toString('utf8');

        nodeAddresses.push({
          nodeId: consensusNode.nodeId,
          RSAPubKey: BlockNodeRsaBootstrapRoster.extractRsaPublicKeyHexFromPemCertificate(pemCertificate),
        });
      } catch (error) {
        logger.warn(
          `Skipping RSA bootstrap roster entry for ${nodeAlias}: failed to read gossip signing key secret '${secretName}': ${(error as Error).message}`,
        );
      }
    }

    if (nodeAddresses.length === 0) {
      logger.warn(
        'Skipping block node RSA bootstrap roster creation because no consensus node gossip signing keys were available. Mirror Node fallback applies.',
      );
      return undefined;
    }

    return BlockNodeRsaBootstrapRoster.buildBlockNodeRsaBootstrapRosterJson(nodeAddresses);
  }

  public static extractRsaPublicKeyHexFromPemCertificate(pemCertificate: string): string {
    const cert: X509Certificate = new X509Certificate(pemCertificate);
    const publicKeyDer: Buffer = cert.publicKey.export({type: 'spki', format: 'der'}) as Buffer;

    return publicKeyDer.toString('hex');
  }

  public static buildBlockNodeRsaBootstrapRosterJson(nodeAddresses: BlockNodeRsaRosterNodeAddress[]): string {
    return JSON.stringify(
      {
        // eslint-disable-next-line unicorn/no-array-sort
        nodeAddress: nodeAddresses.sort((left, right): number => left.nodeId - right.nodeId),
      } as BlockNodeRsaBootstrapRosterStructure,
      undefined,
      2,
    );
  }
}
