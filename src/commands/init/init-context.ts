// SPDX-License-Identifier: Apache-2.0

import {type InitConfig} from './init-config.js';

export interface InitContext {
  repoURLs: string[];
  dirs: string[];
  config: InitConfig;
}
