// SPDX-License-Identifier: Apache-2.0

import {type LocaleData} from './locale-data.js';

export const EN: LocaleData = {
  local_config_not_found_message: 'Local configuration file not found',
  local_config_not_found_troubleshooting_steps: 'Create a local config: solo deployment config create',

  remote_configs_mismatch_message: 'Remote configurations in clusters {{cluster1}} and {{cluster2}} do not match',
  remote_configs_mismatch_troubleshooting_steps:
    'Inspect both configs: kubectl get configmap -n solo\nSync manually before retrying',

  pod_not_ready_message: "Pod '{{pod}}' did not become ready within {{timeout}}s in namespace '{{namespace}}'",
  pod_not_ready_troubleshooting_steps:
    'kubectl get pods -n {{namespace}}\nkubectl describe pod {{pod}} -n {{namespace}}\nkubectl logs {{pod}} -n {{namespace}}',

  relay_not_ready_message: "Relay '{{name}}' did not become ready within {{timeout}}s",
  relay_not_ready_troubleshooting_steps:
    'Check mirror node status: solo mirror node status\nkubectl get pods -n {{namespace}} -l app=relay\nkubectl logs -n {{namespace}} {{pod}}',

  invalid_argument_message: "Invalid argument '{{argument}}': {{reason}}",

  helm_execution_failed_message: 'Helm command failed with exit code {{exitCode}}',
  helm_execution_failed_troubleshooting_steps: 'Check helm version: helm version\nReview helm logs above for details',

  kubernetes_api_error_message: 'Kubernetes API request failed with status {{statusCode}}',
  kubernetes_api_error_troubleshooting_steps: 'kubectl cluster-info\nkubectl get nodes',

  internal_error_message: 'An unexpected internal error occurred',
  internal_error_troubleshooting_steps: 'Please report this issue at https://github.com/hiero-ledger/solo/issues',

  deployment_already_exists_message:
    "A deployment named '{{deploymentName}}' already exists. Please select a different name",
  deployment_already_exists_troubleshooting_steps:
    'Check existing deployments: solo deployment list\nChoose a different name for your deployment',
};
