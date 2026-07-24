// SPDX-License-Identifier: Apache-2.0

export interface NodeAccountId {
  accountId: {
    realm: string;
    shard: string;
    accountNum: string;
  };
}
