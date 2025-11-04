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

dotenv.config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function accountCreate(wallet) {
  const newKey = PrivateKey.generate();
  let accountCreateTransaction = await new AccountCreateTransaction()
    .setInitialBalance(new Hbar(10))
    .setKey(newKey.publicKey)
    .freezeWithSigner(wallet);
  accountCreateTransaction = await accountCreateTransaction.signWithSigner(wallet);
  const accountCreationResponse = await accountCreateTransaction.executeWithSigner(wallet);
  await sleep(3500); // wait for consensus on write transactions
  const accountCreationReceipt = await accountCreationResponse.getReceiptWithSigner(wallet);
  console.log(`account id = ${accountCreationReceipt.accountId.toString()}`);
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
    await sleep(3500); // wait for consensus on write transactions

    const createReceipt = await createResponse.getReceiptWithSigner(wallet);
    console.log(`topic id = ${createReceipt.topicId.toString()}`);

    console.log('Wait to create subscribe to new topic');
    await sleep(3000);

    // Create a subscription to the topic
    const mirrorClient = (await Client.forMirrorNetwork(mirrorNetwork)).setOperator(
      process.env.OPERATOR_ID,
      process.env.OPERATOR_KEY,
    );

    let subscriptionReceivedContent = '';
    let topicSubscriptionReceived = false;
    new TopicMessageQuery()
      .setTopicId(createReceipt.topicId)
      // eslint-disable-next-line no-unused-vars
      .subscribe(
        mirrorClient,
        (topic, error) => {
          if (error) {
            console.error(`ERROR: ${error}`, error);
            topicSubscriptionReceived = true;
            return;
          }
        },
        topic => {
          topicSubscriptionReceived = true;
          subscriptionReceivedContent = Buffer.from(topic.contents).toString('utf-8');
          console.log(`Subscription received message: ${topic.contents}`);
        },
      );

    await sleep(3000);
    const TEST_MESSAGE = 'Hello World for ' + createReceipt.topicId.toString()

    // send one message
    let topicMessageSubmitTransaction = await new TopicMessageSubmitTransaction({
      topicId: createReceipt.topicId,
      message: TEST_MESSAGE,
    }).freezeWithSigner(wallet);
    topicMessageSubmitTransaction = await topicMessageSubmitTransaction.signWithSigner(wallet);
    const sendResponse = await topicMessageSubmitTransaction.executeWithSigner(wallet);
    await sleep(3500); // wait for consensus on write transactions

    const sendReceipt = await sendResponse.getReceiptWithSigner(wallet);
    console.log(`topic sequence number = ${sendReceipt.topicSequenceNumber.toString()}`);

    // send a create account transaction to push record stream files to mirror node
    await accountCreate(wallet);
    await sleep(3500); // wait for consensus on write transactions
    await sleep(1000); // wait for mirror node to sync

    // Check submit message result should success
    const queryURL = `http://localhost:8080/api/v1/topics/${createReceipt.topicId}/messages`;
    let queryReceived = false;
    let queryReceivedContent = '';
    let somethingWrong = false;

    // wait until the transaction reached consensus and retrievable from the mirror node API
    let retry = 0;
    while (!queryReceived && retry < 10) {
      const req = http.request(queryURL, {method: 'GET', timeout: 100, headers: {Connection: 'close'}}, res => {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          // convert chunk to json object
          const obj = JSON.parse(chunk);
          if (obj.messages.length === 0) {
            console.log('No messages received through API query yet');
          } else {
            if (obj.messages.length === 0) {
              console.error(`ERROR: No messages found for the topic ${createReceipt.topicId}`);
              somethingWrong = true;
            }
            // convert message from base64 to utf-8
            const base64 = obj.messages[0].message;
            const buff = Buffer.from(base64, 'base64');
            queryReceivedContent = buff.toString('utf-8');
            console.log(`API query received message: ${queryReceivedContent}`);
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
      await sleep(3500); // wait for consensus on write transactions
      await sleep(1000); // wait for mirror node to sync
      retry++;
    }

    if (!queryReceived) {
      console.error('ERROR: Not received message through API query');
      somethingWrong = true;
    }

    // wait a few seconds to receive subscription message
    await sleep(5000);
    if (!topicSubscriptionReceived) {
      console.error('ERROR: Not received subscription message');
      somethingWrong = true;
    } else if (subscriptionReceivedContent !== TEST_MESSAGE) {
      console.error('ERROR: Message received from subscription but not match: ' + subscriptionReceivedContent);
      somethingWrong = true;
    }

    if (queryReceivedContent === TEST_MESSAGE) {
      console.log('Message received through query successfully');
    } else {
      console.error('ERROR: Message received through query but not match: ' + queryReceivedContent);
      somethingWrong = true;
    }

   if (somethingWrong) {
     process.exit(1)
   }

  } catch (error) {
    console.error(`ERROR: ${error}`, error);
    throw error;
  }


  provider.close();
  console.log('\r::endgroup::');
  process.exit(0);
}

void main();
