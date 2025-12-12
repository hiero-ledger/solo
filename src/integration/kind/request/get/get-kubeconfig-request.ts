// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type GetKubeConfigOptions} from '../../model/get-kubeconfig/get-kubeconfig-options.js';

/**
 * A request to retrieve kubeconfig data.
 */
export class GetKubeConfigRequest implements KindRequest {
  public constructor(private readonly options: GetKubeConfigOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('get', 'kubeconfig');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
