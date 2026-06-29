// SPDX-License-Identifier: Apache-2.0

import {type GitHubReleaseAsset} from './git-hub-release-asset.js';

// GitHub API response interface
export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
}
