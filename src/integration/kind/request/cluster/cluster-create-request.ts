// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type ClusterCreateOptions} from '../../model/create-cluster/cluster-create-options.js';

/**
 * A request to create a new Kind cluster.
 */
export class ClusterCreateRequest implements KindRequest {
  public constructor(private readonly options: ClusterCreateOptions) {
    if (!options) {
      throw new Error('options must not be null');
    }
  }

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('create', 'cluster');
    this.options.apply(builder);
  }
}
