// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {simpleGit} from 'simple-git';
import {DefaultGitClient} from '../../../../src/integration/git/impl/default-git-client.js';
import {type GitClient} from '../../../../src/integration/git/git-client.js';

describe('DefaultGitClient', () => {
  let client: GitClient;
  let tmpDir: string;

  before(async () => {
    // Create a temp git repo with a tag for testing describeTag
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-git-test-'));
    const git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');
    await git.add('.');
    await git.commit('initial commit');
    await git.addTag('v1.0.0');
  });

  after(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

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
    it('should return the latest tag for a git repository', async () => {
      const result = await client.describeTag(tmpDir);
      expect(result).to.equal('v1.0.0');
    });

    it('should throw when the directory is not a git repository', async () => {
      await expect(client.describeTag('/tmp')).to.be.rejected;
    });
  });
});
