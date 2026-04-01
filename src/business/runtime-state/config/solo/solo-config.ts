// SPDX-License-Identifier: Apache-2.0

import {instanceToPlain, plainToInstance} from 'class-transformer';
import {type Facade} from '../../facade/facade.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';
import {HelmChart} from '../common/helm-chart.js';
import {Tss} from './tss.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  public readonly encapsulatedObject: SoloConfigSchema;

  private readonly _helmChart: HelmChart;
  private readonly _ingressControllerHelmChart: HelmChart;
  private readonly _clusterSetupHelmChart: HelmChart;
  private readonly _certManagerHelmChart: HelmChart;
  private readonly _tss: Tss;

  public constructor(schema: SoloConfigSchema) {
    // Deep copy for immutability — prevents callers from mutating projected config through the schema ref
    this.encapsulatedObject = plainToInstance(SoloConfigSchema, instanceToPlain(schema ?? new SoloConfigSchema()));
    this._helmChart = new HelmChart(this.encapsulatedObject.helmChart);
    this._ingressControllerHelmChart = new HelmChart(this.encapsulatedObject.ingressControllerHelmChart);
    this._clusterSetupHelmChart = new HelmChart(this.encapsulatedObject.clusterSetupHelmChart);
    this._certManagerHelmChart = new HelmChart(this.encapsulatedObject.certManagerHelmChart);
    this._tss = new Tss(this.encapsulatedObject.tss);
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

  public get tss(): Tss {
    return this._tss;
  }
}
