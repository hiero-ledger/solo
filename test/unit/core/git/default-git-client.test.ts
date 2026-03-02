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
  let temporaryDirectory: string;

  before(async (): Promise<void> => {
    // Create a temp git repo with a tag for testing describeTag
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-git-test-'));
    const git = simpleGit(temporaryDirectory);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');
    const testFile = path.join(temporaryDirectory, 'test.txt');
    fs.writeFileSync(testFile, 'test content');
    await git.add('.');
    await git.commit('initial commit');
    await git.addTag('v1.0.0');
  });

  after((): void => {
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });

  beforeEach((): void => {
    client = new DefaultGitClient();
  });

  describe('version', () => {
    it('should return a non-empty git version string', async () => {
      const result: string = await client.version();
      expect(result).to.be.a('string');
      expect(result).to.include('git version');
    });
  });

  describe('describeTag', () => {
    it('should return the latest tag for a git repository', async () => {
      const result: string = await client.describeTag(temporaryDirectory);
      expect(result).to.equal('v1.0.0');
    });

    it('should throw when the directory is not a git repository', async () => {
      await expect(client.describeTag('/tmp')).to.be.rejected;
    });
  });
});
