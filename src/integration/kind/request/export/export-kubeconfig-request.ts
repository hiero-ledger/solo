// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type ExportKubeConfigOptions} from '../../model/export-kubeconfig/export-kubeconfig-options.js';

/**
 * A request to export the kubectl configuration of a Kind cluster.
 */
export class ExportKubeConfigRequest implements KindRequest {
  public constructor(private readonly options: ExportKubeConfigOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('export', 'kubeconfig');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
