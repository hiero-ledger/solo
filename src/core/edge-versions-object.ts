// SPDX-License-Identifier: Apache-2.0

/** The subset of {@link OneShotVersionsObject} that is resolved dynamically for `--edge`. */
export interface EdgeVersionsObject {
  consensus: string;
  mirror: string;
  blockNode: string;
  explorer: string;
  relay: string;
}
