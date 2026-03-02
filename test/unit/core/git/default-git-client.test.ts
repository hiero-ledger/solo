// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {DefaultGitClient} from '../../../../src/integration/git/impl/default-git-client.js';
import {type GitClient} from '../../../../src/integration/git/git-client.js';

describe('DefaultGitClient', () => {
  let client: GitClient;

  beforeEach(() => {
    client = new DefaultGitClient();
  });

  describe('version', () => {
    it('should return a non-empty git version string', async () => {
      const result = await client.version();
      expect(result).to.be.a('string');
      expect(result).to.include('git version');
    });
  });

  describe('describeTag', () => {
    it('should throw when the directory is not a git repository', async () => {
      await expect(client.describeTag('/tmp')).to.be.rejected;
    });
  });
});
