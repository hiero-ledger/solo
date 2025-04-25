### How can I avoid using genesis keys ?

You can run `solo account init` anytime after `solo node start`

### Where can I find the default account keys ?

It is the well known default genesis key [Link](https://github.com/hiero-ledger/hiero-consensus-node/blob/develop/hedera-node/data/onboard/GenesisPrivKey.txt)

### How do I get the key for an account?

Use the following command to get account balance and private key of the account `0.0.1007`:

```bash
# get account info of 0.0.1007 and also show the private key
solo account get --account-id 0.0.1007 -n solo-e2e --private-key
```

The output would be similar to the following:

```bash
{
 "accountId": "0.0.1007",
 "privateKey": "302e020100300506032b657004220420cfea706dd9ed2d3c1660ba98acf4fdb74d247cce289ef6ef47486e055e0b9508",
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
