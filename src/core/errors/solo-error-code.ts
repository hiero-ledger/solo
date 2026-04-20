// SPDX-License-Identifier: Apache-2.0

export enum SoloErrorCode {
  // 1xxx — Configuration
  LOCAL_CONFIG_NOT_FOUND = 1001,
  REMOTE_CONFIGS_MISMATCH = 1012,
  DEPLOYMENT_NAME_ALREADY_EXISTS = 1021,

  // 2xxx — Deployment / Infrastructure

  // 3xxx — Component

  // 4xxx — Validation

  // 5xxx — System / Environment
  TIMEOUT = 5007,

  // 9xxx — Internal
}
