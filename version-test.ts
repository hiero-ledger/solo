// SPDX-License-Identifier: Apache-2.0
// using a different version than the one in version.ts to test backwards compatibility

export const TEST_UPGRADE_FROM_VERSION: string = 'v0.75.1';
export const TEST_UPGRADE_TO_VERSION: string = 'v0.78.1';

// Do not delete, used by test script or Taskfile
// PREV_BLOCK_NODE_VERSION must stay below MINIMUM_BLOCK_NODE_VERSION_FOR_16_SLOT_BLOCK_PROOF
// (v0.41.0-0) in version.ts: the migration test deploys it against TEST_UPGRADE_FROM_VERSION,
// which is pre-boundary, so a post-boundary block node here is rejected with BAD_BLOCK_PROOF.
export const PREV_BLOCK_NODE_VERSION: string = 'v0.40.0';
// The block node the version-upgrade example upgrades to alongside TEST_UPGRADE_TO_VERSION. It must stay below
// MINIMUM_BLOCK_NODE_VERSION_FOR_SHA256_HASHING (v0.45.0-0) while TEST_UPGRADE_TO_VERSION is a pre-SHA-256 consensus
// node, because block node 0.45+ rejects SHA-384 blocks.
export const TEST_UPGRADE_TO_BLOCK_NODE_VERSION: string = '0.44.3';
export const PREV_MIRROR_NODE_VERSION: string = 'v0.163.0';
export const PREV_EXPLORER_VERSION: string = '26.0.0';
export const PREV_RELAY_VERSION: string = '0.78.1';
