// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {HelmChart} from '../common/helm-chart.js';
import {type MirrorNodeConfigSchema} from '../../../../data/schema/model/mirror-node/mirror-node-config-schema.js';

export class MirrorNodeConfig implements Facade<MirrorNodeConfigSchema> {
  private readonly _helmChart: HelmChart;

  public constructor(public readonly encapsulatedObject: MirrorNodeConfigSchema) {
    this._helmChart = new HelmChart(this.encapsulatedObject?.helmChart);
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }
}
