// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * A request to list all Kind clusters.
 */
export class GetClustersRequest implements KindRequest {
  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('get', 'clusters');
  }
}
