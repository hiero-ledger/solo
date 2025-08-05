// SPDX-License-Identifier: Apache-2.0

import {type Version} from './src/types/index.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PathEx} from './src/business/utils/path-ex.js';
import fs from 'node:fs';
import {SemVer} from 'semver';

/**
 * This file should only contain versions for dependencies and the function to get the Solo version.
 */
// TODO we should be consistent on the versioning format, let us drop the v prefix from the user, and manually add it
//  right before it required, this adds better semver library compatibility
export const HELM_VERSION: string = 'v3.14.2';
export const KIND_VERSION: string = 'v0.29.0';
export const SOLO_CHART_VERSION: string = '0.54.5';
export const HEDERA_PLATFORM_VERSION: string = process.env.CONSENSUS_NODE_VERSION || 'v0.63.9';
export const MIRROR_NODE_VERSION: string = 'v0.134.0';
export const EXPLORER_VERSION: string = '25.0.0';
export const EXPLORER_OLD_VERSION_BEFORE_LABEL_CHANGE: string = '24.12.0';
export const HEDERA_JSON_RPC_RELAY_VERSION: string = '0.70.0';
export const INGRESS_CONTROLLER_VERSION: string = '0.14.5';
export const BLOCK_NODE_VERSION: string = 'v0.14.0';

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE: string = 'v0.62.3';
export const MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT: SemVer = new SemVer('v0.15.0');

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE: string = 'v0.64.0';

export function getSoloVersion(): Version {
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  const __filename: string = fileURLToPath(import.meta.url);
  const __dirname: string = path.dirname(__filename);

  const packageJsonPath: string = PathEx.resolve(__dirname, './package.json');
  const packageJson: {version: Version} = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}
