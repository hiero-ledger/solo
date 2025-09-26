---
title: "FAQ"
weight: 50
description: >
    Frequently asked questions about the Solo CLI tool.
type: docs
---

### How can I set up a Solo network in a single command?

You can run one of the following commands depending on your needs:

**Single Node Deployment (recommended for development):**

```bash
npx @hashgraph/solo:@latest one-shot single deploy
```

**Multiple Node Deployment (for testing consensus scenarios):**

```bash
npx @hashgraph/solo:@latest one-shot multiple deploy
```

More documentation can be found here:

* [Solo User Guide](step-by-step-guide/#one-shot-deployment)
* [Solo CLI Commands](solo-commands/#one-shot-single)

### How can I tear down a Solo network in a single command?

You can run one of the following commands depending on how you deployed:

**Single Node Teardown:**

```bash
npx @hashgraph/solo:@latest one-shot single destroy
```

**Multiple Node Teardown:**

```bash
npx @hashgraph/solo:@latest one-shot multiple destroy
```

### How can I avoid using genesis keys ?

You can run `solo ledger system init` anytime after `solo consensus node start`.

### Where can I find the default account keys ?

By default, Solo leverages the Hiero Consensus Node well known ED25519 private genesis key: `302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137`, the genesis public key is: `302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92`.
Unless changed it is the private key for the default operator account `0.0.2` of the consensus network.
It is defined in Hiero source code [Link](https://github.com/hiero-ledger/hiero-consensus-node/blob/develop/hedera-node/data/onboard/GenesisPrivKey.txt)

### What is the difference between ECDSA keys and ED25519 keys?

See https://docs.hedera.com/hedera/core-concepts/keys-and-signatures for a detailed answer.

### Where can I find the EVM compatible private key?

You will need to use ECDSA keys for EVM tooling compatibility.  If you take the `privateKeyRaw` provided by Solo and prefix it with `0x` you will have the private key used by Ethereum compatible tools.

### How do I get the key for an account?

Use the following command to get account balance and private key of the account `0.0.1007`:

```bash
# get account info of 0.0.1007 and also show the private key
solo ledger account info --account-id 0.0.1007 --deployment solo-deployment  --private-key
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

### How to handle error "failed to setup chart repositories"

If during the installation of solo-charts you see the error similar to the following:

```text
failed to setup chart repositories,
repository name (hedera-json-rpc-relay) already exists
```

You need to remove the old helm repo manually, first run command `helm repo list` to
see the list of helm repos, and then run `helm repo remove <repo-name>` to remove the repo.
For example:

```bash
helm repo list

NAME                 	URL                                                       
haproxy-ingress      	https://haproxy-ingress.github.io/charts                  
haproxytech          	https://haproxytech.github.io/helm-charts                 
metrics-server       	https://kubernetes-sigs.github.io/metrics-server/         
metallb              	https://metallb.github.io/metallb                         
mirror               	https://hashgraph.github.io/hedera-mirror-node/charts     
hedera-json-rpc-relay	https://hashgraph.github.io/hedera-json-rpc-relay/charts
```

Next run the command to remove the repo:

```bash
helm repo remove hedera-json-rpc-relay
```
