// SPDX-License-Identifier: Apache-2.0

export interface HederaTransactionStatus {
  /** whether the receipt status is SUCCESS */
  isSuccess: boolean;

  /** the receipt status name, such as SUCCESS or INVALID_SIGNATURE */
  status: string;
}
