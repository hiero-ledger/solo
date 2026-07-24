// SPDX-License-Identifier: Apache-2.0

import {type DirectoryPath} from '../types/aliases.js';

export interface ProfileManagerStagingOptions {
  // These values are intentionally passed from the command's resolved config so profile generation
  // does not depend on mutable global flags that can be changed by concurrently running subcommands.
  cacheDir: DirectoryPath;
  releaseTag: string;
  appName: string;
  chainId: string;
}
