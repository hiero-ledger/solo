// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to update all Helm repositories.
 */
export class RepositoryUpdateRequest implements HelmRequest {
  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'update');
  }
}
