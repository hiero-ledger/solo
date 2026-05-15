// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import {type GitHubRelease} from '../types/index.js';
import {SoloError} from './errors/solo-error.js';
import {type EdgeVersionsObject} from './edge-versions-object.js';

const GITHUB_RELEASES_LATEST_URL: string = 'https://api.github.com/repos/{owner}/{repo}/releases/latest';

/**
 * Configuration for fetching the latest stable release version of a single component.
 */
interface ComponentVersionConfig {
  /** GitHub repository owner (organisation or user). */
  readonly owner: string;
  /** GitHub repository name. */
  readonly repository: string;
  /**
   * When `true`, the leading `v` is stripped from the release tag name before returning
   * (e.g. `v0.31.0` → `0.31.0`).  When `false`, the tag name is returned as-is.
   */
  readonly stripVPrefix: boolean;
}

/** Repository configuration for each deployable component. */
const COMPONENT_VERSION_CONFIGS: Readonly<Record<string, ComponentVersionConfig>> = {
  consensus: {owner: 'hiero-ledger', repository: 'hiero-consensus-node', stripVPrefix: false},
  mirror: {owner: 'hiero-ledger', repository: 'hiero-mirror-node', stripVPrefix: false},
  blockNode: {owner: 'hiero-ledger', repository: 'hiero-block-node', stripVPrefix: true},
  explorer: {owner: 'hiero-ledger', repository: 'hiero-mirror-node-explorer', stripVPrefix: true},
  relay: {owner: 'hiero-ledger', repository: 'hiero-json-rpc-relay', stripVPrefix: true},
};

/**
 * Fetches the tag name of the latest stable (non-prerelease, non-draft) release for a
 * given GitHub repository using the GitHub REST API
 * (`GET /repos/{owner}/{repo}/releases/latest`).
 *
 * @param owner - GitHub repository owner.
 * @param repository - GitHub repository name.
 * @returns The tag name of the latest stable release (e.g. `v0.71.0`).
 * @throws SoloError when the GitHub API request fails or returns an unexpected response.
 */
export async function fetchLatestStableGitHubRelease(owner: string, repository: string): Promise<string> {
  const url: string = GITHUB_RELEASES_LATEST_URL.replace('{owner}', owner).replace('{repo}', repository);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': constants.SOLO_USER_AGENT_HEADER,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  } catch (error) {
    throw new SoloError(`GitHub API request to ${url} failed`, error);
  }

  if (!response.ok) {
    throw new SoloError(`GitHub API request to ${url} returned HTTP ${response.status}`);
  }

  let release: GitHubRelease;
  try {
    release = (await response.json()) as GitHubRelease;
  } catch (error) {
    throw new SoloError(`Failed to parse GitHub API response from ${url}`, error);
  }

  if (!release?.tag_name) {
    throw new SoloError(`GitHub API response from ${url} is missing tag_name`);
  }

  return release.tag_name;
}

/**
 * Resolves the latest stable released version for every deployable component by querying
 * the GitHub Releases API.  When an environment-variable override is set for a component
 * (using the same variable names that the edge-version constants in `version.ts` honour),
 * the env-var value is used directly and no API call is made for that component.
 *
 * If the API call for a component fails, the supplied `fallbackVersions` value is used
 * instead so that the deployment can still proceed.
 *
 * @param fallbackVersions - Static version strings to fall back to when an API call fails.
 * @returns Resolved version strings for all components.
 */
export async function resolveEdgeVersions(fallbackVersions: EdgeVersionsObject): Promise<EdgeVersionsObject> {
  const environmentVariableOverrides: Readonly<Record<string, string | undefined>> = {
    consensus: constants.getEnvironmentVariable('CONSENSUS_NODE_EDGE_VERSION'),
    mirror: constants.getEnvironmentVariable('MIRROR_NODE_EDGE_VERSION'),
    blockNode: constants.getEnvironmentVariable('BLOCK_NODE_EDGE_VERSION'),
    explorer: constants.getEnvironmentVariable('EXPLORER_EDGE_VERSION'),
    relay: constants.getEnvironmentVariable('RELAY_EDGE_VERSION'),
  };

  const componentKeys: ReadonlyArray<keyof EdgeVersionsObject> = [
    'consensus',
    'mirror',
    'blockNode',
    'explorer',
    'relay',
  ];

  const resolvedVersions: EdgeVersionsObject = {...fallbackVersions};

  await Promise.all(
    componentKeys.map(async (component: keyof EdgeVersionsObject): Promise<void> => {
      const environmentOverride: string | undefined = environmentVariableOverrides[component as string];
      if (environmentOverride) {
        resolvedVersions[component] = environmentOverride;
        return;
      }

      const config: ComponentVersionConfig = COMPONENT_VERSION_CONFIGS[component as string];
      try {
        const tagName: string = await fetchLatestStableGitHubRelease(config.owner, config.repository);
        resolvedVersions[component] = config.stripVPrefix ? tagName.replace(/^v/, '') : tagName;
      } catch {
        // Fallback to static default when the GitHub API call fails
        resolvedVersions[component] = fallbackVersions[component];
      }
    }),
  );

  return resolvedVersions;
}
