// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to update Helm repositories: the named ones, or all of them when no names are given.
 */
export class RepositoryUpdateRequest implements HelmRequest {
  public constructor(private readonly repositoryNames: readonly string[] = []) {}

  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'update');
    for (const name of this.repositoryNames) {
      builder.positional(name);
    }
  }
}
