---
title: "Using Solo with Hiero JavaScript SDK"
weight: 70 
description: >
    This page describes how to use Solo with Hiero JavaScript SDK. 
    It includes instructions for setting up a local Solo network, creating test accounts, and running example scripts.
type: docs
---

## Using Solo with the Hiero JavaScript SDK

First, please follow solo repository README to install solo and Docker Desktop.
You also need to install the Taskfile tool following the instructions [here](https://taskfile.dev/installation/).

Then we start with launching a local Solo network with the following commands:

```bash
# launch a local Solo network with mirror node and hedera explorer
cd scripts
task default-with-mirror
```

Then create a new test account with the following command:

```
npm run solo-test -- ledger account create --deployment solo-deployment --hbar-amount 100
```

The output would be similar to the following:

```bash
 *** new account created ***
-------------------------------------------------------------------------------
{
 "accountId": "0.0.1007",
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```

Then use the following command to get private key of the account `0.0.1007`:

```bash
 npm run solo-test -- ledger account info --account-id 0.0.1007 --deployment solo-deployment --private-key
```

The output would be similar to the following:

```bash
{
 "accountId": "0.0.1007",
 "privateKey": "302e020100300506032b657004220420411a561013bceabb8cb83e3dc5558d052b9bd6a8977b5a7348bf9653034a29d7",
 "privateKeyRaw": "411a561013bceabb8cb83e3dc5558d052b9bd6a8977b5a7348bf9653034a29d7"
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```

Next step please clone the Hiero Javascript SDK repository <https://github.com/hiero-ledger/hiero-sdk-js>.
At the root of the project `hiero-sdk-js`,  create a file `.env` and add the following content:

```bash
# Hiero Operator Account ID
export OPERATOR_ID="0.0.1007"

# Hiero Operator Private Key
export OPERATOR_KEY="302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013"

# Hiero Network
export HEDERA_NETWORK="local-node"
```

Make sure to assign the value of accountId to `OPERATOR_ID` and the value of privateKey to `OPERATOR_KEY`.

Then try the following command to run the test

```bash
node examples/create-account.js 
```

The output should be similar to the following:

```bash
private key = 302e020100300506032b6570042204208a3c1093c4df779c4aa980d20731899e0b509c7a55733beac41857a9dd3f1193
public key = 302a300506032b6570032100c55adafae7e85608ea893d0e2c77e2dae3df90ba8ee7af2f16a023ba2258c143
account id = 0.0.1009
```

Or try the topic creation example:

```bash
node scripts/create-topic.js
```

The output should be similar to the following:

```bash
topic id = 0.0.1008
topic sequence number = 1


```

You can use Hiero Explorer to check transactions and topics created in the Solo network:
<http://localhost:8080/localnet/dashboard>

Finally, after done with using solo, using the following command to tear down the Solo network:

```bash
task clean
```

### Retrieving Logs

You can find log for running solo command under the directory ~/.solo/logs/

The file solo.log contains the logs for the solo command.
The file hashgraph-sdk.log contains the logs from Solo client when sending transactions to network nodes.
