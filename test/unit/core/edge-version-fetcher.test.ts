// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {EdgeVersionFetcher} from '../../../src/core/edge-version-fetcher.js';
import {type EdgeVersionsObject} from '../../../src/core/edge-versions-object.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';

const STABLE_RELEASE: {tag_name: string; prerelease: boolean; draft: boolean} = {
  tag_name: 'v1.2.3',
  prerelease: false,
  draft: false,
};

describe('edge-version-fetcher', (): void => {
  let fetchStub: SinonStub;

  beforeEach((): void => {
    fetchStub = sinon.stub(globalThis, 'fetch' as never);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('fetchLatestStableGitHubRelease', (): void => {
    it('returns the tag_name from the GitHub API response', async (): Promise<void> => {
      fetchStub.resolves({
        ok: true,
        json: async (): Promise<typeof STABLE_RELEASE> => STABLE_RELEASE,
      });

      const result: string = await EdgeVersionFetcher.fetchLatestStableGitHubRelease('some-owner', 'some-repo');

      expect(result).to.equal('v1.2.3');
      expect(fetchStub).to.have.been.calledOnce;
      const calledUrl: string = fetchStub.firstCall.args[0] as string;
      expect(calledUrl).to.include('some-owner');
      expect(calledUrl).to.include('some-repo');
    });

    it('throws SoloError when the HTTP response is not OK', async (): Promise<void> => {
      fetchStub.resolves({ok: false, status: 404});

      await expect(EdgeVersionFetcher.fetchLatestStableGitHubRelease('owner', 'repo')).to.be.rejectedWith(
        SoloError,
        /HTTP 404/,
      );
    });

    it('throws SoloError when fetch itself rejects', async (): Promise<void> => {
      fetchStub.rejects(new Error('network failure'));

      await expect(EdgeVersionFetcher.fetchLatestStableGitHubRelease('owner', 'repo')).to.be.rejectedWith(SoloError);
    });

    it('throws SoloError when the response body is missing tag_name', async (): Promise<void> => {
      fetchStub.resolves({ok: true, json: async (): Promise<Record<string, never>> => ({})});

      await expect(EdgeVersionFetcher.fetchLatestStableGitHubRelease('owner', 'repo')).to.be.rejectedWith(
        SoloError,
        /tag_name/,
      );
    });
  });

  describe('resolveEdgeVersions', (): void => {
    const fallbacks: EdgeVersionsObject = {
      consensus: 'v0.50.0',
      mirror: 'v0.100.0',
      blockNode: '0.20.0',
      explorer: '10.0.0',
      relay: '0.50.0',
    };

    it('returns fetched versions for all components', async (): Promise<void> => {
      const tagMapping: Record<string, string> = {
        'hiero-consensus-node': 'v0.71.0',
        'hiero-mirror-node': 'v0.153.1',
        'hiero-block-node': 'v0.31.0',
        'hiero-mirror-node-explorer': 'v26.0.0',
        'hiero-json-rpc-relay': 'v0.76.2',
      };

      fetchStub.callsFake(async (url: string): Promise<{ok: boolean; json: () => Promise<{tag_name: string}>}> => {
        // Match the repository name that appears between the last '/' and '/releases' in the URL
        const repositoryMatch: RegExpMatchArray | null = (url as string).match(/\/repos\/[^/]+\/([^/]+)\/releases/);
        const matchedRepository: string = repositoryMatch?.[1] ?? '';
        return {
          ok: true,
          json: async (): Promise<{tag_name: string}> => ({tag_name: tagMapping[matchedRepository] ?? 'vX.Y.Z'}),
        };
      });

      const result: EdgeVersionsObject = await EdgeVersionFetcher.resolveEdgeVersions(fallbacks);

      expect(result.consensus).to.equal('v0.71.0');
      expect(result.mirror).to.equal('v0.153.1');
      // blockNode, explorer, relay should have 'v' stripped
      expect(result.blockNode).to.equal('0.31.0');
      expect(result.explorer).to.equal('26.0.0');
      expect(result.relay).to.equal('0.76.2');
    });

    it('falls back to fallback version when GitHub API call fails', async (): Promise<void> => {
      fetchStub.rejects(new Error('network error'));

      const result: EdgeVersionsObject = await EdgeVersionFetcher.resolveEdgeVersions(fallbacks);

      expect(result.consensus).to.equal(fallbacks.consensus);
      expect(result.mirror).to.equal(fallbacks.mirror);
      expect(result.blockNode).to.equal(fallbacks.blockNode);
      expect(result.explorer).to.equal(fallbacks.explorer);
      expect(result.relay).to.equal(fallbacks.relay);
    });

    it('uses environment variable override and skips GitHub API call for that component', async (): Promise<void> => {
      const originalEnvironmentVariable: string | undefined = process.env.CONSENSUS_NODE_EDGE_VERSION;
      process.env.CONSENSUS_NODE_EDGE_VERSION = 'v0.99.0';

      try {
        fetchStub.resolves({
          ok: true,
          json: async (): Promise<{tag_name: string}> => ({tag_name: 'v0.71.0'}),
        });

        const result: EdgeVersionsObject = await EdgeVersionFetcher.resolveEdgeVersions(fallbacks);

        // Consensus should use the env var, not the GitHub API result
        expect(result.consensus).to.equal('v0.99.0');
      } finally {
        if (originalEnvironmentVariable === undefined) {
          delete process.env.CONSENSUS_NODE_EDGE_VERSION;
        } else {
          process.env.CONSENSUS_NODE_EDGE_VERSION = originalEnvironmentVariable;
        }
      }
    });
  });
});
