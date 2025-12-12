// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type UnInstallChartOptions} from '../../model/install/un-install-chart-options.js';

/**
 * A request to uninstall a Helm chart.
 */
export class ChartUninstallRequest implements HelmRequest {
  public constructor(
    private readonly releaseName: string,
    private readonly options: UnInstallChartOptions,
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (releaseName.trim() === '') {
      throw new Error('releaseName must not be null or blank');
    }
  }

  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('uninstall');

    // Apply options if provided
    if (this.options) {
      this.options.apply(builder);
    }
    builder.positional(this.releaseName);
  }
}
