// SPDX-License-Identifier: Apache-2.0

export interface PodCondition {
  /**
   * The type of the condition
   */
  readonly type: string;

  /**
   * The status of the condition
   */
  readonly status: string;

  /**
   * Human readable details about the condition, for example why the scheduler could not place the pod
   */
  readonly message?: string;
}
