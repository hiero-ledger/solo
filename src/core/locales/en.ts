// SPDX-License-Identifier: Apache-2.0

import {type LocaleData} from './locale-data.js';

export const EN: LocaleData = {
  local_config_not_found_message: 'Local configuration file not found',
  local_config_not_found_troubleshooting_steps: 'Create a local config: solo deployment config create',

  remote_configs_mismatch_message: 'Remote configurations in clusters {{cluster1}} and {{cluster2}} do not match',
  remote_configs_mismatch_troubleshooting_steps:
    'Inspect both configs: kubectl get configmap -n solo\nSync manually before retrying',

  deployment_already_exists_message:
    "A deployment named '{{deploymentName}}' already exists. Please select a different name",
  deployment_already_exists_troubleshooting_steps:
    'Check existing deployments: solo deployment list\nChoose a different name for your deployment',
};
