// SPDX-License-Identifier: Apache-2.0

export enum SoloErrorCode {
  // 1xxx — Configuration
  LOCAL_CONFIG_NOT_FOUND = 1001,
  REMOTE_CONFIGS_MISMATCH = 1012,
  DEPLOYMENT_NAME_ALREADY_EXISTS = 1021,

  // 2xxx — Deployment / Infrastructure
  POD_NOT_READY = 2004,

  // 3xxx — Component
  RELAY_NOT_READY = 3004,

  // 4xxx — Validation
  INVALID_ARGUMENT = 4001,

  // 5xxx — System / Environment
  HELM_EXECUTION_FAILED = 5001,
  KUBERNETES_API_ERROR = 5004,
  TIMEOUT = 5007,

  // 9xxx — Internal
  INTERNAL_ERROR = 9001,
}
