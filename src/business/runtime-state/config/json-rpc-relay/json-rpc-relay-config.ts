// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {HelmChart} from '../common/helm-chart.js';
import {type JsonRpcRelayConfigSchema} from '../../../../data/schema/model/json-rpc-relay/json-rpc-relay-config-schema.js';

export class JsonRpcRelayConfig implements Facade<JsonRpcRelayConfigSchema> {
  private readonly _helmChart: HelmChart;

  public constructor(public readonly encapsulatedObject: JsonRpcRelayConfigSchema) {
    this._helmChart = new HelmChart(this.encapsulatedObject?.helmChart);
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }
}
