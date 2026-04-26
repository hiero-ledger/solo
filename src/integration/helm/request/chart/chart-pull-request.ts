// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type Chart} from '../../model/chart.js';

/**
 * A request to pull a Helm chart.
 */
export class ChartPullRequest implements HelmRequest {
  public constructor(
    private readonly chart: Chart,
    private readonly version: string,
    private readonly destinationDirectory: string,
  ) {}

  public apply(builder: HelmExecutionBuilder): void {
    builder
      .subcommands('pull')
      .argument('version', this.version)
      .argument('destination', this.destinationDirectory)
      .positional(this.chart.qualified());
  }
}
