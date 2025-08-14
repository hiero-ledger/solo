---
title: "FAQ"
weight: 50
description: >
    Frequently asked questions about the Solo CLI tool.
type: docs
---

### How can I set up a Solo network in a single command?

You can run `npx @hashgraph/solo:@latest quick-start single deploy`

More documentation can be found here:
- [Solo User Guide](step-by-step-guide/#quick-start-deployment)
- [Solo CLI Commands](solo-commands/#quick-start-single)

# How cain I tear down a Solo network in a single command?

You can run `npx @hashgraph/solo:@latest quick-start single destroy`

### How can I avoid using genesis keys ?

You can run `solo ledger system init` anytime after `solo consensus node start`

### Where can I find the default account keys ?

The default genesis key is `302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137`
It is the key for default operator account `0.0.2` of the consensus network.
It is defined in Hiero source code [Link](https://github.com/hiero-ledger/hiero-consensus-node/blob/develop/hedera-node/data/onboard/GenesisPrivKey.txt)

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
