---
title: "Using Network Load Generator with Solo"
weight: 110
description: >
    This document describes how to use Network Load Generator with Solo.
type: docs
---

## Using Network Load Generator with Solo

The [Network Load Generator (NLG)](https://github.com/hashgraph/network-load-generator) is a benchmarking tool designed to stress test Hiero networks by generating configurable transaction loads.
To use the Network Load Generator with Solo, follow these steps:

1. Create a Solo network:

```bash
npx @hashgraph/solo:@latest one-shot single deploy
```

2. Use the `rapid-fire` commands to install the NLG chart and start a load test:

```bash
@hashgraph/solo:@latest rapid-fire crypto-transfer start --deployment my-deployment --args '"-c 3 -a 10 -t 60"'
```

3. In a separate terminal, you can start a different load test:

```bash
@hashgraph/solo:@latest rapid-fire nft-transfer start --deployment my-deployment --args '"-c 3 -a 10 -t 60"'
```

4. To stop the load test early use the `stop` command:

```bash
@hashgraph/solo:@latest rapid-fire nft-transfer stop --deployment my-deployment
```

5. To stop all running load tests and uninstall the NLG chart, use the `destroy` command:

```bash
@hashgraph/solo:@latest rapid-fire destroy all --deployment my-deployment
```

See this example for more details: [examples/network-load-generator/README.md](../../examples/network-load-generator/README.md)

A full list of all available `rapid-fire` commands can be found in [Solo CLI Commands](solo-commands.md/#rapid-fire)

## Argument list for every NLG class

| Class                  | Argument                                                                                                                                                                                               |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CryptoTransferLoadTest | [-c <clients>] [-a <accounts>] [-K ED25519 / ECDSA] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [transfer / query / mixed] [-metrics]                                   |
| TokenTransferLoadTest  | [-c <clients>] [-a <accounts>] [-T <tokens>] [-A <associations>] [-K ED25519 / ECDSA] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [-metrics]                            |
| NftTransferLoadTest    | [-c <clients>] [-a <accounts>] [-T <tokens>] [-n <NFTs/token>] [-S flat / hot -p <percent>] [-K ED25519 / ECDSA] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [-metrics] |
| SmartContractLoadTest  | [-c <clients>] [-a <accounts>] [-K ED25519 / ECDSA] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [-metrics]                                                              |
| HeliSwapLoadTest       | [-c <clients>] [-a <accounts>] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [-metrics]                                                                                   |
| LongevityLoadTest      | [-c <clients>] [-a <accounts>] [-R] [-t / tt <time>] [-host <host>] [-port <port>] [-endpoint <endpoint>] [-metrics]                                                                                   |

