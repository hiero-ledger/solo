// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {HelmChart} from '../common/helm-chart.js';
import {type ExplorerConfigSchema} from '../../../../data/schema/model/explorer/explorer-config-schema.js';

export class ExplorerConfig implements Facade<ExplorerConfigSchema> {
  private readonly _helmChart: HelmChart;

  public constructor(public readonly encapsulatedObject: ExplorerConfigSchema) {
    this._helmChart = new HelmChart(this.encapsulatedObject?.helmChart);
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }
}
