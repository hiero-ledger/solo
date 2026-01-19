// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {type CommandFlag} from '../../types/flag-types.js';

export const DEFAULT_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.devMode, flags.cacheDir, flags.releaseTag],
};

const PREPARE_UPGRADE_FLAGS_REQUIRED_FLAGS: CommandFlag[] = [flags.deployment];
const PREPARE_UPGRADE_FLAGS_OPTIONAL_FLAGS: CommandFlag[] = [
  flags.cacheDir,
  flags.devMode,
  flags.quiet,
  flags.skipNodeAlias,
];
export const PREPARE_UPGRADE_FLAGS: {optional: CommandFlag[]; required: CommandFlag[]} = {
  required: PREPARE_UPGRADE_FLAGS_REQUIRED_FLAGS,
  optional: PREPARE_UPGRADE_FLAGS_OPTIONAL_FLAGS,
};

const COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS = [flags.deployment];
const COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS = [
  flags.app,
  flags.cacheDir,
  flags.debugNodeAlias,
  flags.nodeAliasesUnparsed,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.upgradeZipFile,
  flags.s6,
];

const COMMON_UPDATE_FLAGS_REQUIRED_FLAGS = [flags.deployment];
const COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS = [
  flags.app,
  flags.cacheDir,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
  flags.chartDirectory,
  flags.devMode,
  flags.quiet,
  flags.localBuildPath,
  flags.force,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.domainNames,
  flags.releaseTag,
  flags.s6,
];

export const UPGRADE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.upgradeVersion],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_PREPARE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPGRADE_EXECUTE_FLAGS = {
  required: [...COMMON_UPGRADE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPGRADE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.nodeAlias],
  optional: [
    ...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
};

export const UPDATE_PREPARE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.outputDir, flags.nodeAlias],
  optional: [
    ...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS,
    flags.newAdminKey,
    flags.newAccountNumber,
    flags.tlsPublicKey,
    flags.gossipPrivateKey,
    flags.gossipPublicKey,
    flags.tlsPrivateKey,
  ],
};

export const UPDATE_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS],
};

export const UPDATE_EXECUTE_FLAGS = {
  required: [...COMMON_UPDATE_FLAGS_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS, flags.adminKey, flags.newAdminKey, flags.newAccountNumber],
};

const COMMON_DESTROY_REQUIRED_FLAGS = [flags.deployment, flags.nodeAlias];

const COMMON_DESTROY_OPTIONAL_FLAGS = [
  flags.cacheDir,
  flags.app,
  flags.chainId,
  flags.debugNodeAlias,
  flags.endpointType,
  flags.soloChartVersion,
  flags.devMode,
  flags.force,
  flags.localBuildPath,
  flags.quiet,
  flags.chartDirectory,
  flags.domainNames,
  flags.releaseTag,
  flags.s6,
];

const COMMON_ADD_REQUIRED_FLAGS = [flags.deployment];

const COMMON_ADD_OPTIONAL_FLAGS = [
  flags.app,
  flags.chainId,
  flags.clusterRef,
  flags.debugNodeAlias,
  flags.soloChartVersion,
  flags.persistentVolumeClaims,
  flags.grpcTlsCertificatePath,
  flags.grpcWebTlsCertificatePath,
  flags.grpcTlsKeyPath,
  flags.grpcWebTlsKeyPath,
  flags.gossipEndpoints,
  flags.grpcEndpoints,
  flags.devMode,
  flags.force,
  flags.localBuildPath,
  flags.chartDirectory,
  flags.quiet,
  flags.domainNames,
  flags.cacheDir,
  flags.endpointType,
  flags.generateGossipKeys,
  flags.generateTlsKeys,
  flags.releaseTag,
  flags.s6,
];

export const DESTROY_FLAGS = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_PREPARE_FLAGS = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const DESTROY_EXECUTE_FLAGS = {
  required: [...COMMON_DESTROY_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_DESTROY_OPTIONAL_FLAGS],
};

export const ADD_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const ADD_PREPARE_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.outputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey],
};

export const ADD_SUBMIT_TRANSACTIONS_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS],
};

export const ADD_EXECUTE_FLAGS = {
  required: [...COMMON_ADD_REQUIRED_FLAGS, flags.inputDir],
  optional: [...COMMON_ADD_OPTIONAL_FLAGS, flags.adminKey, flags.haproxyIps, flags.envoyIps],
};

export const LOGS_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.outputDir],
};

export const STATES_FLAGS = {
  required: [flags.deployment, flags.nodeAliasesUnparsed],
  optional: [flags.clusterRef, flags.quiet],
};

export const REFRESH_FLAGS = {
  required: [flags.deployment],
  optional: [
    flags.app,
    flags.localBuildPath,
    flags.devMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    flags.releaseTag,
    flags.cacheDir,
    flags.domainNames,
    flags.s6,
  ],
};

export const KEYS_FLAGS = {
  required: [flags.deployment],
  optional: [
    flags.cacheDir,
    flags.generateGossipKeys,
    flags.generateTlsKeys,
    flags.devMode,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    // TODO remove namespace once the remote config manager is updated to pull the namespace from the local config
    flags.namespace,
  ],
};

export const STOP_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.nodeAliasesUnparsed, flags.s6],
};

export const FREEZE_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.s6],
};

export const START_FLAGS = {
  required: [flags.deployment],
  optional: [
    flags.app,
    flags.quiet,
    flags.nodeAliasesUnparsed,
    flags.debugNodeAlias,
    flags.stateFile,
    flags.stakeAmounts,
    flags.forcePortForward,
    flags.s6,
  ],
};

export const RESTART_FLAGS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.s6],
};

export const SETUP_FLAGS = {
  required: [flags.deployment],
  optional: [
    flags.cacheDir,
    flags.releaseTag,
    flags.app,
    flags.appConfig,
    flags.nodeAliasesUnparsed,
    flags.quiet,
    flags.devMode,
    flags.localBuildPath,
    flags.adminPublicKeys,
    flags.domainNames,
  ],
};

export const DIAGNOSTICS_CONNECTIONS = {
  required: [flags.deployment],
  optional: [flags.quiet, flags.devMode],
};
