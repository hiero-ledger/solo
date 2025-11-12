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
} from '@hiero-ledger/sdk';

import dotenv from 'dotenv';
import http from 'http';
import {spawn} from 'child_process';

// Override console.log and console.error to include timestamps
const originalLog = console.log;
const originalError = console.error;
const RETRY_DELAY_MS = 5000; // 5 seconds
const CONSENSUS_DELAY_MS = 4000; // 4 seconds
const MAX_RETRY_COUNT = 90;
const MIRROR_NETWORK = '127.0.0.1:8081';

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

  console.log(`Executing command: ${command}`);

  const grpcurl = spawn(command, {
    shell: true,
    detached: true,
  });

  // Log stdout
  grpcurl.stdout?.on('data', data => {
    console.log(`gRPC topic subscription: stdout: ${data}`);
  });

  // Log stderr
  grpcurl.stderr?.on('data', data => {
    console.error(`gRPC topic subscription: stderr: ${data}`);
  });

  grpcurl.on('error', error => {
    console.error(`gRPC topic subscription: Error starting grpcurl: ${error.message}`, error);
  });

  grpcurl.on('close', code => {
    console.log(`gRPC topic subscription: grpcurl process exited with code ${code}`);
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

async function initialize() {
  if (process.env.OPERATOR_ID === null || process.env.OPERATOR_KEY === null || process.env.HEDERA_NETWORK === null) {
    throw new Error('Environment variables OPERATOR_ID, HEDERA_NETWORK, and OPERATOR_KEY are required.');
  }

  try {
    console.log(`Hedera network = ${process.env.HEDERA_NETWORK}`);
    const provider = new LocalProvider();
    provider._client.setMirrorNetwork(MIRROR_NETWORK);

    // if process.env.OPERATOR_KEY string size is 100, it is ECDSA key, if 96, it is ED25519 key
    const operatorKeySize = process.env.OPERATOR_KEY.length;
    const operatorKey =
      operatorKeySize === 100
        ? PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY)
        : PrivateKey.fromStringED25519(process.env.OPERATOR_KEY);

    const wallet = new Wallet(process.env.OPERATOR_ID, process.env.OPERATOR_KEY, provider);

    if (process.env.NEW_NODE_ACCOUNT_ID) {
      console.log(`NEW_NODE_ACCOUNT_ID = ${process.env.NEW_NODE_ACCOUNT_ID}`);
      provider._client.setNetwork({
        '127.0.0.1:50211': AccountId.fromString(process.env.NEW_NODE_ACCOUNT_ID),
      });
    }

    // Create a subscription to the topic
    const mirrorClient = (await Client.forMirrorNetwork(MIRROR_NETWORK)).setOperator(
      process.env.OPERATOR_ID,
      process.env.OPERATOR_KEY,
    );

    return {
      provider,
      operatorKey,
      wallet,
      mirrorClient,
      subscriptionReceivedContent: '',
      topicSubscriptionResponseReceived: false,
      topicIdString: '',
      testMessage: '',
      subscribeTopicStart: null,
      messageSendStart: null,
      queryReceived: false,
      queryReceivedContent: '',
      somethingWrong: false,
    };
  } catch (error) {
    console.error(`❌ ERROR: Failed to initialize: ${error}`, error);
    throw error;
  }
}

async function createTopic(operatorKey, wallet) {
  try {
    // create topic
    let transaction = await new TopicCreateTransaction().setAdminKey(operatorKey).freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    const createResponse = await transaction.executeWithSigner(wallet);
    await sleep(CONSENSUS_DELAY_MS); // wait for consensus on write transactions

    const createReceipt = await createResponse.getReceiptWithSigner(wallet);

    const topicIdString = createReceipt.topicId.toString();
    console.log(`topic id = ${topicIdString.toString()}`);
    console.log('Wait for topic creation to reach consensus...');
    await sleep(CONSENSUS_DELAY_MS);

    return topicIdString;
  } catch (error) {
    console.error(`❌ ERROR: Failed to create topic: ${error}`, error);
    throw error;
  }
}

function subscribeToTopic(context) {
  const subscribeTopicStart = Date.now();
  new TopicMessageQuery().setTopicId(context.topicIdString).subscribe(
    context.mirrorClient,
    (topic, error) => {
      if (error) {
        console.error(`ERROR: ${error}`, error);
        // ERROR: Error: 14 UNAVAILABLE: Received HTTP status code 504
        if (!'Error: 14'.includes(error.toString())) {
          context.topicSubscriptionResponseReceived = true;
          // Start gRPC subscription in a separate process for debugging purposes
          startGrpcSubscription(context.topicIdString.toString());
        }
      }
    },
    topic => {
      if (!context.topicSubscriptionResponseReceived) {
        // Only log for the first received message
        context.topicSubscriptionResponseReceived = true;
        context.subscriptionReceivedContent = Buffer.from(topic.contents).toString('utf-8');
        console.log(
          `✅ [${new Date().toISOString()}] Subscription received message after ${(
            (Date.now() - subscribeTopicStart) /
            1000
          ).toFixed(2)}s: ${topic.contents}`,
        );
      } else {
        console.log(
          `listener called while topicSubscriptionResponseReceived is already true [topic = ${JSON.stringify(topic)}]`,
        );
      }
    },
  );
  return subscribeTopicStart;
}

async function submitMessageToTopic(context) {
  // Record start time before sending message
  context.messageSendStart = Date.now();
  console.log(`Starting to send message at: ${new Date(context.messageSendStart).toISOString()}`);

  // send one message
  let topicMessageSubmitTransaction = await new TopicMessageSubmitTransaction({
    topicId: context.topicIdString,
    message: context.testMessage,
  }).freezeWithSigner(context.wallet);
  topicMessageSubmitTransaction = await topicMessageSubmitTransaction.signWithSigner(context.wallet);
  const sendResponse = await topicMessageSubmitTransaction.executeWithSigner(context.wallet);

  await sleep(CONSENSUS_DELAY_MS); // wait for consensus on write transactions

  const sendReceipt = await sendResponse.getReceiptWithSigner(context.wallet);
  console.log(`topic sequence number = ${sendReceipt.topicSequenceNumber.toString()}`);
}

async function queryMirrorNodeApiForTopicMessage(context) {
  // Check submit message result should succeed via mirror node API
  const queryURL = `http://localhost:8080/api/v1/topics/${context.topicIdString}/messages`;

  // wait until the transaction reached consensus and retrievable from the mirror node API
  let retry = 0;
  while (!context.queryReceived && retry < MAX_RETRY_COUNT) {
    const req = http.request(queryURL, {method: 'GET', timeout: 100, headers: {Connection: 'close'}}, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => {
        // convert chunk to json object
        const obj = JSON.parse(chunk);
        if (obj.messages.length === 0) {
          console.log(
            `No messages received through API query yet after ${(
              (Date.now() - context.messageSendStart) /
              1000
            ).toFixed(2)}s`,
          );
        } else {
          // convert message from base64 to utf-8
          const base64 = obj.messages[0].message;
          const buff = Buffer.from(base64, 'base64');
          context.queryReceivedContent = buff.toString('utf-8');
          console.log(
            `✅ [${new Date().toISOString()}] API query received message after ${(
              (Date.now() - context.messageSendStart) /
              1000
            ).toFixed(2)}s: ${context.queryReceivedContent}`,
          );
          context.queryReceived = true;
        }
      });
    });
    req.on('error', e => {
      console.log(`problem with request, message = : ${e.message}  cause = : ${e.cause}`);
    });
    req.end(); // make the request

    // Start gRPC subscription in a separate process for debugging purposes
    startGrpcSubscription(context.topicIdString.toString());

    // wait and try again
    // send a create account transaction to push record stream files to mirror node
    await accountCreate(context.wallet);

    await sleep(RETRY_DELAY_MS); // wait for consensus on write transactions and mirror node to sync
    retry++;
  }
  return retry;
}

function validateTestWasSuccessful(context, retry) {
  if (!context.queryReceived) {
    console.error(`❌ ERROR: No message received through API query (retries: ${retry} of ${MAX_RETRY_COUNT})`);
    context.somethingWrong = true;
  } else if (context.queryReceivedContent !== context.testMessage) {
    console.error(`❌ ERROR: Message received through query but not match: ${context.queryReceivedContent}`);
    context.somethingWrong = true;
  }

  if (!context.topicSubscriptionResponseReceived) {
    console.log(
      `❌ ERROR: Subscription timed out waiting for message (total message subscription time: ${(
        (Date.now() - context.subscribeTopicStart) /
        1000
      ).toFixed(2)}s)`,
    );
    context.somethingWrong = true;
  } else if (context.subscriptionReceivedContent !== context.testMessage) {
    console.error(`❌ ERROR: Message received from subscription but not match: ${context.subscriptionReceivedContent}`);
    context.somethingWrong = true;
  }

  console.log('✅ Test completed successfully.');
}

async function main() {
  console.log('\r::group::create-topic');
  let context;

  try {
    context = await initialize();

    context.topicIdString = await createTopic(context.operatorKey, context.wallet);

    // Start gRPC subscription in a separate process for debugging purposes
    startGrpcSubscription(context.topicIdString.toString());

    context.subscribeTopicStart = subscribeToTopic(context);

    context.testMessage = `Create Topic Test Message for ${context.topicIdString.toString()}`;

    await submitMessageToTopic(context);

    // send a create account transaction to push record stream files to mirror node
    await accountCreate(context.wallet);
    let retry = await queryMirrorNodeApiForTopicMessage(context);

    while (
      !context.topicSubscriptionResponseReceived &&
      Date.now() - context.subscribeTopicStart < RETRY_DELAY_MS * MAX_RETRY_COUNT
    ) {
      console.log(
        `Waiting for subscription to receive message... (${((Date.now() - context.subscribeTopicStart) / 1000).toFixed(2)}s elapsed)`,
      );

      // Start gRPC subscription in a separate process for debugging purposes
      startGrpcSubscription(context.topicIdString.toString());

      // send a create account transaction to push record stream files to mirror node
      await accountCreate(context.wallet);

      await sleep(RETRY_DELAY_MS);
    }

    validateTestWasSuccessful(context, retry);

    if (context.somethingWrong) {
      context?.provider?.close();
      context?.mirrorClient?.close();
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error}`, error);
    await sleep(1000); // wait for all logs to be printed
    process.exit(1);
  }

  context?.provider.close();
  context?.mirrorClient.close();
  console.log('\r::endgroup::');
  await sleep(1000); // wait for all logs to be printed
  process.exit(0);
}

void main();
