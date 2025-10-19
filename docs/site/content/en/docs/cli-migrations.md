---
title: "Updated CLI Command Mappings"
weight: 35
description: >
    A mapping of CLI commands from < v0.44.0 to >= v0.44.0
type: docs
---

# Updated CLI Command Mappings

> The following tables provide a complete mapping of previous (< v0.44.0) CLI commands to their updated three-level structure.
> Entries marked as No changes retain their original form.

## Init

| **Old Command** | **New Command** |
|-----------------|-----------------|
| init            | *No changes*    |

## Block node

| **Old Command**     | **New Command** |
|---------------------|-----------------|
| block node add      | *No changes*    |
| block node destroy  | *No changes*    |
| block node upgrade  | *No changes*    |

## Account

| **Old Command** | **New Command**       |
|-----------------|-----------------------|
| account init    | ledger system init    |
| account update  | ledger account update |
| account create  | ledger account create |
| account get     | ledger account info   |

## One Shot

| **Old Command**            | **New Command**  |
|----------------------------|------------------|
| one-shot single deploy  | one shot deploy  |
| one-shot single destroy | one shot destroy |

## Cluster Reference

| **Old Command**        | **New Command**               |
|------------------------|-------------------------------|
| cluster-ref connect    | cluster-ref config connect    |
| cluster-ref disconnect | cluster-ref config disconnect |
| cluster-ref list       | cluster-ref config list       |
| cluster-ref info       | cluster-ref config info       |
| cluster-ref setup      | cluster-ref config setup      |
| cluster-ref reset      | cluster-ref config reset      |

## Deployment

| **Old Command**        | **New Command**           |
|------------------------|---------------------------|
| deployment add-cluster | deployment cluster attach |
| deployment list        | deployment config list    |
| deployment create      | deployment config create  |
| deployment delete      | deployment config destroy |

## Explorer

| **Old Command**   | **New Command**        |
|-------------------|------------------------|
| explorer deploy   | explorer node add      |
| explorer destroy  | explorer node destroy  |

## Mirror Node

| **Old Command**     | **New Command**      |
|---------------------|----------------------|
| mirror-node deploy  | mirror node add      |
| mirror-node destroy | mirror node destroy  |

## Relay

| **Old Command** | **New Command**     |
|-----------------|---------------------|
| relay deploy    | relay node add      |
| relay destroy   | relay node destroy  |

## Network

| **Old Command** | **New Command**           |
|-----------------|---------------------------|
| network deploy  | consensus network deploy  |
| network destroy | consensus network destroy |

## Node

| **Old Command**                 | **New Command**                               |
|---------------------------------|-----------------------------------------------|
| node keys                       | keys consensus generate                       |
| node freeze                     | consensus network freeze                      |
| node upgrade                    | consensus network upgrade                     |
| node setup                      | consensus node setup                          |
| node start                      | consensus node start                          |
| node stop                       | consensus node stop                           |
| node upgrade                    | consensus node upgrade                        |
| node restart                    | consensus node restart                        |
| node refresh                    | consensus node refresh                        |
| node add                        | consensus node add                            |
| node update                     | consensus node update                         |
| node delete                     | consensus node destroy                        |
| node add-prepare                | consensus dev-node-add prepare                |
| node add-submit-transaction     | consensus dev-node-add submit-transaction     |
| node add-execute                | consensus dev-node-add execute                |
| node update-prepare             | consensus dev-node-update prepare             |
| node update-submit-transaction  | consensus dev-node-update submit-transaction  |
| node update-execute             | consensus dev-node-update execute             |
| node upgrade-prepare            | consensus dev-node-upgrade prepare            |
| node upgrade-submit-transaction | consensus dev-node-upgrade submit-transaction |
| node upgrade-execute            | consensus dev-node-upgrade execute            |
| node delete-prepare             | consensus dev-node-delete prepare             |
| node delete-submit-transaction  | consensus dev-node-delete submit-transaction  |
| node delete-execute             | consensus dev-node-delete execute             |
| node prepare-upgrade            | consensus dev-freeze prepare-upgrade          |
| node freeze-upgrade             | consensus dev-freeze freeze-upgrade           |
| node download-generated-files   | consensus diagnostic configs                  |
| node logs                       | consensus diagnostics all                     |
| node states                     | consensus state download                      |
