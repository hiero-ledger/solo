// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type ClusterDeleteOptions} from '../../model/delete-cluster/cluster-delete-options.js';

/**
 * A request to delete a Kind cluster.
 */
export class ClusterDeleteRequest implements KindRequest {
  public constructor(private readonly options: ClusterDeleteOptions) {
    if (!options) {
      throw new Error('options must not be null');
    }
  }

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('delete', 'cluster');
    this.options.apply(builder);
  }
}
