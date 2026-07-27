// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {simpleGit} from 'simple-git';
import {type GitClient} from '../git-client.js';

/**
 * Default implementation of {@link GitClient} that delegates to the `simple-git` library.
 */
@injectable()
export class DefaultGitClient implements GitClient {
  public async version(): Promise<string> {
    const result: string = await simpleGit().raw(['version']);
    return result.trim();
  }

  public async describeTag(directory: string): Promise<string> {
    const result: string = await simpleGit(directory).raw(['describe', '--tags', '--abbrev=0']);
    return result.trim();
  }
}
