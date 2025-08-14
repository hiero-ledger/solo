// SPDX-License-Identifier: Apache-2.0

import {AccountId, Client, Logger, LogLevel, NodeCreateTransaction, PrivateKey, ServiceEndpoint} from '@hiero-ledger/sdk';
import {readFileSync} from 'node:fs';

const TREASURY_ACCOUNT_ID = '0.0.2';
const GENESIS_KEY = '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
const logPrefix = 'SoloNodeCreateTransaction:';

async function main() {
  console.log(`${logPrefix} begin...`);
  const treasuryAccountId = TREASURY_ACCOUNT_ID;
  const treasuryPrivateKey = PrivateKey.fromStringED25519(GENESIS_KEY);
  const network = {};

  network['127.0.0.1:50211'] = AccountId.fromString('0.0.3');

  const mirrorNetwork = '127.0.0.1:8081';

  // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work when running locally or in a pipeline
  console.log(`${logPrefix} creating client`);
  const nodeClient = Client.fromConfig({
    network,
    mirrorNetwork,
    scheduleNetworkUpdate: false,
  });
  nodeClient.setOperator(treasuryAccountId, treasuryPrivateKey);
  nodeClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));
  console.log(`${logPrefix} client created`);

  // NodeCreateTransaction
  console.log(`${logPrefix} running node create transaction`);
  const prepareOutputString = readFileSync('/tmp/solo-deployment/prepare-output/node-add.json');
  const prepareOutput = JSON.parse(prepareOutputString.toString());
  // console.log(`${logPrefix} ${JSON.stringify(prepareOutput)}`);
  const transformedPrepareOutput = prepareOutputParser(prepareOutput);
  try {
    const nodeCreateTx = new NodeCreateTransaction()
      .setAccountId(transformedPrepareOutput.newNode.accountId)
      .setGossipEndpoints(transformedPrepareOutput.gossipEndpoints)
      .setServiceEndpoints(transformedPrepareOutput.grpcServiceEndpoints)
      .setGossipCaCertificate(transformedPrepareOutput.signingCertDer)
      .setCertificateHash(transformedPrepareOutput.tlsCertHash)
      .setAdminKey(transformedPrepareOutput.adminKey.publicKey)
      .freezeWith(nodeClient);
    const signedTx = await nodeCreateTx.sign(transformedPrepareOutput.adminKey);
    const txResp = await signedTx.execute(nodeClient);
    const nodeCreateReceipt = await txResp.getReceipt(nodeClient);
    console.log(`${logPrefix} NodeCreateReceipt: ${nodeCreateReceipt.toString()}`);
  } catch (error) {
    throw new Error(`${logPrefix} Error adding node to network: ${error.message}`, {cause: error});
  }
}

function prepareOutputParser(prepareOutput) {
  const transformedPrepareOutput = {};
  transformedPrepareOutput.signingCertDer = new Uint8Array(prepareOutput.signingCertDer.split(','));
  transformedPrepareOutput.gossipEndpoints = prepareEndpoints('FQDN', prepareOutput.gossipEndpoints, 50111);
  transformedPrepareOutput.grpcServiceEndpoints = prepareEndpoints('FQDN', prepareOutput.grpcServiceEndpoints, 50111);
  transformedPrepareOutput.adminKey = PrivateKey.fromStringED25519(prepareOutput.adminKey);
  transformedPrepareOutput.nodeAlias = prepareOutput.newNode.name;
  transformedPrepareOutput.existingNodeAliases = prepareOutput.existingNodeAliases;
  transformedPrepareOutput.allNodeAliases = [...prepareOutput.existingNodeAliases, prepareOutput.newNode.name];

  const fieldsToImport = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  for (const property of fieldsToImport) {
    transformedPrepareOutput[property] = prepareOutput[property];
  }

  return transformedPrepareOutput;
}

function prepareEndpoints(endpointType, endpoints, defaultPort) {
  const returnValue = [];
  for (const endpoint of endpoints) {
    const parts = endpoint.split(':');

    let url = '';
    let port = defaultPort;

    if (parts.length === 2) {
      url = parts[0].trim();
      port = +parts[1].trim();
    } else if (parts.length === 1) {
      url = parts[0];
    } else {
      throw new Error(`${logPrefix} incorrect endpoint format. expected url:port, found ${endpoint}`);
    }

    if (endpointType.toUpperCase() === 'IP') {
      returnValue.push(
        new ServiceEndpoint({
          port: +port,
          ipAddressV4: parseIpAddressToUint8Array(url),
        }),
      );
    } else {
      returnValue.push(
        new ServiceEndpoint({
          port: +port,
          domainName: url,
        }),
      );
    }
  }

  return returnValue;
}

function parseIpAddressToUint8Array(ipAddress) {
  const parts = ipAddress.split('.');
  const uint8Array = new Uint8Array(4);

  for (let index = 0; index < 4; index++) {
    uint8Array[index] = Number.parseInt(parts[index], 10);
  }

  return uint8Array;
}

main()
  .then()
  .catch(e => {
    console.log(`${logPrefix} failure`, e);
  })
  .finally(() => {
    console.log(`${logPrefix} finally`);
  });
