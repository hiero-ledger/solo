// SPDX-License-Identifier: Apache-2.0

export enum ErrorCategory {
  CONFIGURATION = 1, // 1xxx — deployment config, schema, existence
  DEPLOYMENT = 2, // 2xxx — cluster, namespace, pod lifecycle
  COMPONENT = 3, // 3xxx — relay, mirror node, explorer, CN
  VALIDATION = 4, // 4xxx — user input, flags, formatting
  SYSTEM = 5, // 5xxx — kubectl, DNS, permissions, timeouts
  INTERNAL = 9, // 9xxx — unexpected bugs, not-implemented
}
