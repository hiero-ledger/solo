// SPDX-License-Identifier: Apache-2.0

import {AccountId, Client, Logger, LogLevel, Long, NodeUpdateTransaction, PrivateKey} from '@hiero-ledger/sdk';
import {readFileSync} from 'node:fs';

const TREASURY_ACCOUNT_ID = '0.0.2';
const GENESIS_KEY = '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
const logPrefix = 'SoloNodeUpdateTransaction:';

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

  // NodeUpdateTransaction
  console.log(`${logPrefix} running node update transaction`);
  const prepareOutputString = readFileSync('/tmp/solo-deployment/prepare-output/node-update.json');
  const prepareOutput = JSON.parse(prepareOutputString.toString());
  // console.log(`${logPrefix} ${JSON.stringify(prepareOutput)}`);
  const transformedPrepareOutput = prepareOutputParser(prepareOutput);
  try {
    const nodeUpdateTx = new NodeUpdateTransaction()
      .setNodeId(new Long(nodeIdFromNodeAlias('node2')))
      .setAccountId(transformedPrepareOutput.newAccountNumber)
      .freezeWith(nodeClient);
    const signedTx = await nodeUpdateTx.sign(transformedPrepareOutput.adminKey);
    const txResp = await signedTx.execute(nodeClient);
    const nodeUpdateReceipt = await txResp.getReceipt(nodeClient);
    console.log(`${logPrefix} NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);
  } catch (error) {
    throw new Error(`${logPrefix} Error adding node to network: ${error.message}`, {cause: error});
  }
}

function prepareOutputParser(prepareOutput) {
  const transformedPrepareOutput = {};
  transformedPrepareOutput.adminKey = PrivateKey.fromStringED25519(prepareOutput.adminKey);
  transformedPrepareOutput.nodeAlias = prepareOutput.newAccountNumber;

  const fieldsToImport = ['newAccountNumber', 'nodeAlias', 'existingNodeAliases', 'allNodeAliases', 'upgradeZipHash'];

  for (const property of fieldsToImport) {
    transformedPrepareOutput[property] = prepareOutput[property];
  }

  return transformedPrepareOutput;
}

function nodeIdFromNodeAlias(nodeAlias) {
  for (let index = nodeAlias.length - 1; index > 0; index--) {
    if (Number.isNaN(Number.parseInt(nodeAlias[index]))) {
      return Number.parseInt(nodeAlias.substring(index + 1, nodeAlias.length)) - 1;
    }
  }

  throw new Error(`Can't get node id from node ${nodeAlias}`);
}

main()
  .then()
  .catch(e => {
    console.log(`${logPrefix} failure`, e);
  })
  .finally(() => {
    console.log(`${logPrefix} finally`);
  });
