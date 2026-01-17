// SPDX-License-Identifier: Apache-2.0

import {type Version} from './src/types/index.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PathEx} from './src/business/utils/path-ex.js';
import fs from 'node:fs';
import {SemVer} from 'semver';
import * as constants from './src/core/constants.js';

/**
 * This file should only contain versions for dependencies and the function to get the Solo version.
 */
// TODO we should be consistent on the versioning format, let us drop the v prefix from the user, and manually add it
//  right before it required, this adds better semver library compatibility
export const HELM_VERSION: string = 'v3.14.2';
export const KIND_VERSION: string = 'v0.29.0';
export const PODMAN_VERSION: string = '5.6.0';
export const VFKIT_VERSION: string = 'v0.6.1';
export const GVPROXY_VERSION: string = 'v0.8.7';
export const KUBECTL_VERSION: string = 'v1.32.2';
export const SOLO_CHART_VERSION: string = constants.getEnvironmentVariable('SOLO_CHART_VERSION') || '0.58.1';
export const HEDERA_PLATFORM_VERSION: string = constants.getEnvironmentVariable('CONSENSUS_NODE_VERSION') || '0.67.2';
export const MIRROR_NODE_VERSION: string = constants.getEnvironmentVariable('MIRROR_NODE_VERSION') || 'v0.145.2';
export const EXPLORER_VERSION: string = constants.getEnvironmentVariable('EXPLORER_VERSION') || '25.1.1';
export const HEDERA_JSON_RPC_RELAY_VERSION: string = constants.getEnvironmentVariable('RELAY_VERSION') || '0.73.0';
export const INGRESS_CONTROLLER_VERSION: string =
  constants.getEnvironmentVariable('INGRESS_CONTROLLER_VERSION') || '0.14.5';
export const BLOCK_NODE_VERSION: string = constants.getEnvironmentVariable('BLOCK_NODE_VERSION') || 'v0.23.2';
export const NETWORK_LOAD_GENERATOR_CHART_VERSION: string =
  constants.getEnvironmentVariable('NETWORK_LOAD_GENERATOR_CHART_VERSION') || '0.8.0';

export const MINIO_OPERATOR_VERSION: string = constants.getEnvironmentVariable('MINIO_OPERATOR_VERSION') || '7.1.1';
export const PROMETHEUS_STACK_VERSION: string =
  constants.getEnvironmentVariable('PROMETHEUS_STACK_VERSION') || '52.0.1';
export const GRAFANA_AGENT_VERSION: string = constants.getEnvironmentVariable('GRAFANA_AGENT_VERSION') || '0.27.1';
export const GRAFANA_PODLOGS_CRD_VERSION: string =
  constants.getEnvironmentVariable('GRAFANA_PODLOGS_CRD_VERSION') || 'v1.11.3';
export const PROMETHEUS_OPERATOR_CRDS_VERSION: string =
  constants.getEnvironmentVariable('PROMETHEUS_OPERATOR_CRDS_VERSION') || '24.0.2';

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE: string = 'v0.62.3';
export const MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT: SemVer = new SemVer('v0.15.0');

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE: string = 'v0.64.0';
export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_GRPC_WEB_ENDPOINTS: string = 'v0.62.0';

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
