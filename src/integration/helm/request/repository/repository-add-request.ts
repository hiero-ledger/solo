// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type Repository} from '../../model/repository.js';
import {type AddRepoOptions} from '../../model/add/add-repo-options.js';

/**
 * A request to add a new Helm repository.
 */
export class RepositoryAddRequest implements HelmRequest {
  public constructor(
    private readonly repository: Repository,
    private readonly options?: AddRepoOptions,
  ) {
    if (!repository) {
      throw new Error('repository must not be null');
    }
    if (!repository.name || repository.name.trim() === '') {
      throw new Error('repository name must not be null or blank');
    }
    if (!repository.url || repository.url.trim() === '') {
      throw new Error('repository url must not be null or blank');
    }
  }

  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'add').positional(this.repository.name).positional(this.repository.url);
    // Apply options if provided
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
