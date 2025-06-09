// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';
import {HelmChart} from '../common/helm-chart.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  private readonly _helmChart: HelmChart;
  private readonly _ingressControllerHelmChart: HelmChart;
  private readonly _clusterSetupHelmChart: HelmChart;
  private readonly _certManagerHelmChart: HelmChart;

  public constructor(public readonly encapsulatedObject: SoloConfigSchema) {
    this._helmChart = new HelmChart(this.encapsulatedObject?.helmChart);
    this._ingressControllerHelmChart = new HelmChart(this.encapsulatedObject?.ingressControllerHelmChart);
    this._clusterSetupHelmChart = new HelmChart(this.encapsulatedObject?.clusterSetupHelmChart);
    this._certManagerHelmChart = new HelmChart(this.encapsulatedObject?.certManagerHelmChart);
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }

  public get ingressControllerHelmChart(): HelmChart {
    return this._ingressControllerHelmChart;
  }

  public get clusterSetupHelmChart(): HelmChart {
    return this._clusterSetupHelmChart;
  }

  public get certManagerHelmChart(): HelmChart {
    return this._certManagerHelmChart;
  }
}
