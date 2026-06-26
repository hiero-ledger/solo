// SPDX-License-Identifier: Apache-2.0

export interface Definition {
  describe: string;
  defaultValue?: boolean | string | number;
  alias?: string | string[];
  type?: string;
  disablePrompt?: boolean;
  dataMask?: string;
}
