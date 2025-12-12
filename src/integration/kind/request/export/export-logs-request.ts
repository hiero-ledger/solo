// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type ExportLogsOptions} from '../../model/export-logs/export-logs-options.js';

/**
 * A request to export the logs of a Kind cluster.
 */
export class ExportLogsRequest implements KindRequest {
  public constructor(private readonly options: ExportLogsOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('export', 'logs');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
