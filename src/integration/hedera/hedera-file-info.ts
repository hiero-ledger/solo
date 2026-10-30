// SPDX-License-Identifier: Apache-2.0

export interface HederaFileInfo {
  /** the size of the file in bytes */
  size: number;

  /** the number of keys on the file, 0 for an immutable file such as a system file */
  keyCount: number;
}
