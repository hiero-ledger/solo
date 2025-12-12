// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to update the dependencies of a Helm chart.
 */
export class ChartDependencyUpdateRequest implements HelmRequest {
  public constructor(public readonly chartName: string) {
    if (!chartName) {
      throw new Error('chartName must not be null');
    }
    if (chartName.trim() === '') {
      throw new Error('chartName must not be blank');
    }
  }

  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('dependency', 'update').positional(this.chartName);
  }
}
