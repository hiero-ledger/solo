// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {HelmChart} from '../common/helm-chart.js';
import {type BlockNodeConfigSchema} from '../../../../data/schema/model/block-node/block-node-config-schema.js';

export class BlockNodeConfig implements Facade<BlockNodeConfigSchema> {
  private readonly _helmChart: HelmChart;

  public constructor(public readonly encapsulatedObject: BlockNodeConfigSchema) {
    this._helmChart = new HelmChart(this.encapsulatedObject?.helmChart);
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }
}
