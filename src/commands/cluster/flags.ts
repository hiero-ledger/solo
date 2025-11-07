// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {type CommandFlags} from '../../types/flag-types.js';

export const NO_FLAGS: CommandFlags = {
  required: [],
  optional: [flags.devMode, flags.quiet],
};

export const DEFAULT_FLAGS: CommandFlags = {
  required: [flags.clusterRef],
  optional: [flags.devMode, flags.quiet],
};

export const SETUP_FLAGS: CommandFlags = {
  required: [],
  optional: [
    flags.chartDirectory,
    flags.clusterRef,
    flags.clusterSetupNamespace,
    flags.deployMinio,
    flags.deployPrometheusStack,
    flags.deployGrafanaAgent,
    flags.quiet,
    flags.soloChartVersion,
  ],
};

export const RESET_FLAGS: CommandFlags = {
  required: [flags.clusterRef],
  optional: [flags.clusterSetupNamespace, flags.force, flags.quiet],
};

export const CONNECT_FLAGS: CommandFlags = {
  required: [flags.clusterRef, flags.context],
  optional: [flags.devMode, flags.quiet],
};
