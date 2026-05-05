#!/usr/bin/env node

/**
 * Rewrites relay HEDERA_NETWORK to use stable haproxy LoadBalancer IPs.
 *
 * After cluster recreation the backed-up ConfigMap contains stale ClusterIPs.
 * This script replaces those IPs with the pinned haproxy LB IPs sourced from
 * expected-lb-ips.env, keeping account IDs in place.
 *
 * Account IDs are sorted numerically; the lowest goes to c1 haproxy, the
 * highest to c2 haproxy. This avoids relying on JSON key insertion order.
 *
 * Usage: node patch-relay-hedera-network.js <old-hedera-network-json>
 * Writes: /tmp/relay-patch.json
 */

import {writeFileSync} from 'fs';

const oldJson = process.argv[2];
if (!oldJson) {
  console.error('Usage: patch-relay-hedera-network.js <old-hedera-network-json>');
  process.exit(1);
}

const c1Ip = process.env.KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC ?? '172.19.1.0';
const c2Ip = process.env.KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC ?? '172.19.2.0';

const old = JSON.parse(oldJson);

// Sort account IDs numerically by last component (e.g. "3.2.3" < "3.2.4").
// Node1 (lower account #, in cluster 1) maps to c1 haproxy; node2 to c2 haproxy.
const accountIds = Object.values(old).sort((a, b) => {
  const lastA = Number(a.split('.').at(-1));
  const lastB = Number(b.split('.').at(-1));
  return lastA - lastB;
});

const newNetwork = {
  [`${c1Ip}:50211`]: accountIds[0],
  [`${c2Ip}:50211`]: accountIds[1],
};

const patch = {data: {HEDERA_NETWORK: JSON.stringify(newNetwork)}};

writeFileSync('/tmp/relay-patch.json', JSON.stringify(patch));
console.log('[relay-patch] HEDERA_NETWORK ->', JSON.stringify(newNetwork));
