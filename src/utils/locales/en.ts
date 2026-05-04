// SPDX-License-Identifier: Apache-2.0

import {type SoloErrorLocaleEntry} from './locale-data.js';

export class EnLocale {
  public static readonly local_config_not_found: SoloErrorLocaleEntry = {
    message: 'Local configuration file not found',
    troubleshooting_steps: 'Create a local config: solo deployment config create',
  };

  public static readonly remote_configs_mismatch: SoloErrorLocaleEntry = {
    message: 'Remote configurations in clusters {{cluster1}} and {{cluster2}} do not match',
    troubleshooting_steps: 'Inspect both configs: kubectl get configmap -n solo\nSync manually before retrying',
  };

  public static readonly deployment_already_exists: SoloErrorLocaleEntry = {
    message: "A deployment named '{{deploymentName}}' already exists. Please select a different name",
    troubleshooting_steps:
      'Check existing deployments: solo deployment list\nChoose a different name for your deployment',
  };

  public static readonly create_deployment_error: SoloErrorLocaleEntry = {
    message: 'Error creating deployment',
    troubleshooting_steps:
      'Check the logs for details: tail -f ~/.solo/logs/solo.log | jq\nVerify cluster connectivity: kubectl get nodes\nReview your configuration: solo deployment config view',
  };
}
