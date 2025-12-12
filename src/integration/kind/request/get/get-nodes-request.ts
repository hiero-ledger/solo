// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type GetNodesOptions} from '../../model/get-nodes/get-nodes-options.js';

/**
 * A request to list Kind nodes for the specified context.
 */
export class GetNodesRequest implements KindRequest {
  public constructor(private readonly options: GetNodesOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('get', 'nodes');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
