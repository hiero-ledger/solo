// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from './deprecation.js';

export interface Definition {
  describe: string;
  defaultValue?: boolean | string | number;
  alias?: string | string[];
  type?: string;
  disablePrompt?: boolean;
  dataMask?: string;
  deprecated?: Deprecation;
}
