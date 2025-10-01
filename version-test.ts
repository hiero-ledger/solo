// SPDX-License-Identifier: Apache-2.0
// using a different version than the one in version.ts to test backwards compatibility

import * as constants from './src/core/constants.js';

export const TEST_UPGRADE_VERSION: string = constants.getEnvironmentVariable('TEST_UPGRADE_VERSION') || 'v0.66.0';
export const TEST_LOCAL_BLOCK_NODE_VERSION: string =
  constants.getEnvironmentVariable('TEST_LOCAL_BLOCK_NODE_VERSION') || '0.15.0';
export const TEST_LOCAL_HEDERA_PLATFORM_VERSION: string =
  constants.getEnvironmentVariable('TEST_LOCAL_HEDERA_PLATFORM_VERSION') || 'v0.64.2';
