// SPDX-License-Identifier: Apache-2.0

import {
  Wallet,
  LocalProvider,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  AccountCreateTransaction,
  PrivateKey,
  Hbar,
  TopicMessageQuery,
  Client,
  AccountId,
  TopicId,
  Timestamp,
} from '@hiero-ledger/sdk';

import dotenv from 'dotenv';
import http from 'http';
import {spawn} from 'child_process';

// Override console.log and console.error to include timestamps
const originalLog = console.log;
const originalError = console.error;
const RETRY_DELAY_MS = 5000; // 5 seconds
const CONSENSUS_DELAY_MS = 4000; // 4 seconds
const MAX_RETRY_COUNT = 60;

console.log = function (...args) {
  originalLog(`[${new Date().toISOString()}]`, ...args);
};

console.error = function (...args) {
  originalError(`[${new Date().toISOString()}] ERROR:`, ...args);
};

dotenv.config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Starts a gRPC subscription to the specified topic
 * @param {string} topicId - The topic ID to subscribe to
 */
function startGrpcSubscription(topicId) {
  // Extract just the numeric part from the topic ID (e.g., '0.0.1018' -> '1018')
  const topicNum = topicId.split('.').pop();

  // Build the command with properly formatted JSON
  const command = `grpcurl -plaintext -d '{"topicID": {"topicNum": ${topicNum}}, "limit": 0}' localhost:8081 com.hedera.mirror.api.proto.ConsensusService/subscribeTopic`;

  console.log('Executing command:', command);

  const grpcurl = spawn(command, {
    shell: true,
    detached: true,
  });

  // Log stdout
  grpcurl.stdout?.on('data', data => {
    console.log(`stdout: ${data}`);
  });

  // Log stderr
  grpcurl.stderr?.on('data', data => {
    console.error(`stderr: ${data}`);
  });

  grpcurl.on('error', error => {
    console.error(`Error starting grpcurl: ${error.message}`);
  });

  grpcurl.on('close', code => {
    console.log(`grpcurl process exited with code ${code}`);
  });

  // Don't unref immediately, let's see the output first
  // grpcurl.unref();
}

async function accountCreate(wallet) {
  const newKey = PrivateKey.generate();
  let accountCreateTransaction = await new AccountCreateTransaction()
    .setInitialBalance(new Hbar(10))
    .setKey(newKey.publicKey)
    .freezeWithSigner(wallet);
  accountCreateTransaction = await accountCreateTransaction.signWithSigner(wallet);
  const accountCreationResponse = await accountCreateTransaction.executeWithSigner(wallet);
  await sleep(CONSENSUS_DELAY_MS); // wait for consensus on write transactions
  const accountCreationReceipt = await accountCreationResponse.getReceiptWithSigner(wallet);
  console.log(`newly created account id = ${accountCreationReceipt.accountId.toString()}`);
}

async function main() {
  console.log('\r::group::create-topic');
  if (process.env.OPERATOR_ID === null || process.env.OPERATOR_KEY === null || process.env.HEDERA_NETWORK === null) {
    throw new Error('Environment variables OPERATOR_ID, HEDERA_NETWORK, and OPERATOR_KEY are required.');
  }

  console.log(`Hedera network = ${process.env.HEDERA_NETWORK}`);
  const provider = new LocalProvider();
  const mirrorNetwork = '127.0.0.1:8081';
  provider._client.setMirrorNetwork(mirrorNetwork);

  const wallet = new Wallet(process.env.OPERATOR_ID, process.env.OPERATOR_KEY, provider);

  try {
    if (process.env.NEW_NODE_ACCOUNT_ID) {
      console.log(`NEW_NODE_ACCOUNT_ID = ${process.env.NEW_NODE_ACCOUNT_ID}`);
      provider._client.setNetwork({
        '127.0.0.1:50211': AccountId.fromString(process.env.NEW_NODE_ACCOUNT_ID),
      });
    }

    // if process.env.OPERATOR_KEY string size is 100, it is ECDSA key, if 96, it is ED25519 key
    const operatorKeySize = process.env.OPERATOR_KEY.length;
    // create topic
    const operatorKey =
      operatorKeySize === 100
        ? PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY)
        : PrivateKey.fromStringED25519(process.env.OPERATOR_KEY);
    let transaction = await new TopicCreateTransaction().setAdminKey(operatorKey).freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    const createResponse = await transaction.executeWithSigner(wallet);
    await sleep(CONSENSUS_DELAY_MS); // wait for consensus on write transactions

    const createReceipt = await createResponse.getReceiptWithSigner(wallet);

    const topicIdString = createReceipt.topicId.toString();
    console.log(`topic id = ${topicIdString.toString()}`);

    console.log('Wait to create subscribe to new topic');
    await sleep(CONSENSUS_DELAY_MS);

    // Create a subscription to the topic
    const mirrorClient = (await Client.forMirrorNetwork(mirrorNetwork)).setOperator(
      process.env.OPERATOR_ID,
      process.env.OPERATOR_KEY,
    );

    // Start gRPC subscription in a separate process
    startGrpcSubscription(topicIdString.toString());

    let subscriptionReceivedContent = '';
    let topicSubscriptionResponseReceived = false;

    const subscribeTopicStart = Date.now();
    new TopicMessageQuery().setTopicId(topicIdString).subscribe(
      mirrorClient,
      (topic, error) => {
        if (error) {
          console.error(`ERROR: ${error}`, error);
          topicSubscriptionResponseReceived = true;
          return;
        }
      },
      topic => {
        if (!topicSubscriptionResponseReceived) {
          // Only log for the first received message
          const receiveTime = Date.now();
          topicSubscriptionResponseReceived = true;
          subscriptionReceivedContent = Buffer.from(topic.contents).toString('utf-8');
          const elapsedSeconds = (receiveTime - subscribeTopicStart) / 1000;
          console.log(
            `✅ [${new Date().toISOString()}] Subscription received message after ${elapsedSeconds.toFixed(2)}s: ${topic.contents}`,
          );
        }
      },
    );

    const TEST_MESSAGE = `Create Topic Test Message for ${topicIdString.toString()}`;

    // Record start time before sending message
    const messageSendStart = Date.now();
    console.log(`Starting to send message at: ${new Date(messageSendStart).toISOString()}`);

    // send one message
    let topicMessageSubmitTransaction = await new TopicMessageSubmitTransaction({
      topicId: topicIdString,
      message: TEST_MESSAGE,
    }).freezeWithSigner(wallet);
    topicMessageSubmitTransaction = await topicMessageSubmitTransaction.signWithSigner(wallet);
    const sendResponse = await topicMessageSubmitTransaction.executeWithSigner(wallet);

    await sleep(CONSENSUS_DELAY_MS); // wait for consensus on write transactions

    const sendReceipt = await sendResponse.getReceiptWithSigner(wallet);
    console.log(`topic sequence number = ${sendReceipt.topicSequenceNumber.toString()}`);

    // send a create account transaction to push record stream files to mirror node
    await accountCreate(wallet);

    // Check submit message result should success
    const queryURL = `http://localhost:8080/api/v1/topics/${topicIdString}/messages`;
    let queryReceived = false;
    let queryReceivedContent = '';
    let somethingWrong = false;

    // wait until the transaction reached consensus and retrievable from the mirror node API
    let retry = 0;
    while (!queryReceived && retry < MAX_RETRY_COUNT) {
      const req = http.request(queryURL, {method: 'GET', timeout: 100, headers: {Connection: 'close'}}, res => {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          // convert chunk to json object
          const obj = JSON.parse(chunk);
          if (obj.messages.length === 0) {
            console.log('No messages received through API query yet');
          } else {
            // convert message from base64 to utf-8
            const base64 = obj.messages[0].message;
            const buff = Buffer.from(base64, 'base64');
            queryReceivedContent = buff.toString('utf-8');
            const queryReceiveTime = Date.now();
            const elapsedSeconds = (queryReceiveTime - messageSendStart) / 1000;
            console.log(
              `✅ [${new Date().toISOString()}] API query received message after ${elapsedSeconds.toFixed(2)}s: ${queryReceivedContent}`,
            );
            queryReceived = true;
          }
        });
      });
      req.on('error', e => {
        console.log(`problem with request, message = : ${e.message}  cause = : ${e.cause}`);
      });
      req.end(); // make the request
      // wait and try again
      // send a create account transaction to push record stream files to mirror node
      await accountCreate(wallet);
      await sleep(RETRY_DELAY_MS); // wait for consensus on write transactions and mirror node to sync
      retry++;
    }

    if (!queryReceived) {
      console.error(`❌ ERROR: No message received through API query (retries: ${retry} of ${MAX_RETRY_COUNT})`);
      somethingWrong = true;
    } else if (queryReceivedContent !== TEST_MESSAGE) {
      console.error('❌ ERROR: Message received through query but not match: ' + queryReceivedContent);
      somethingWrong = true;
    }

    if (!topicSubscriptionResponseReceived) {
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - messageSendStart) / 1000;
      console.log(
        `❌ ERROR: Subscription timed out waiting for message (total message send time: ${elapsedSeconds.toFixed(2)}s, retries: ${retry} of ${MAX_RETRY_COUNT}, estimated max time: ${(RETRY_DELAY_MS * MAX_RETRY_COUNT) / 1000}s)`,
      );
      somethingWrong = true;
    } else if (subscriptionReceivedContent !== TEST_MESSAGE) {
      console.error('❌ ERROR: Message received from subscription but not match: ' + subscriptionReceivedContent);
      somethingWrong = true;
    }

    if (somethingWrong) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error}`, error);
    throw error;
  }

  provider.close();
  console.log('\r::endgroup::');
  process.exit(0);
}

void main();
