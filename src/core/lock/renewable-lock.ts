// SPDX-License-Identifier: Apache-2.0

export interface RenewableLock {
  readonly durationSeconds: number;
  tryRenew(): Promise<boolean>;
}
