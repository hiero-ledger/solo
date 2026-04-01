// SPDX-License-Identifier: Apache-2.0

import {HelmChartSchema} from '../common/helm-chart-schema.js';
import {TssSchema} from './tss-schema.js';
import {Exclude, Expose, Type} from 'class-transformer';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

@Exclude()
export class SoloConfigSchema {
  public static readonly SCHEMA_VERSION: SemanticVersion<number> = new SemanticVersion(1);
  public static readonly EMPTY: SoloConfigSchema = new SoloConfigSchema(SoloConfigSchema.SCHEMA_VERSION.major);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public helmChart: HelmChartSchema = new HelmChartSchema();

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public ingressControllerHelmChart: HelmChartSchema = new HelmChartSchema();

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public clusterSetupHelmChart: HelmChartSchema = new HelmChartSchema();

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public certManagerHelmChart: HelmChartSchema = new HelmChartSchema();

  @Expose()
  @Type((): typeof TssSchema => TssSchema)
  public tss: TssSchema = new TssSchema();

  public constructor(
    schemaVersion?: number,
    helmChart?: HelmChartSchema,
    ingressControllerHelmChart?: HelmChartSchema,
    clusterSetupHelmChart?: HelmChartSchema,
    certManagerHelmChart?: HelmChartSchema,
    tss?: TssSchema,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    if (helmChart !== undefined) {
      this.helmChart = helmChart;
    }
    if (ingressControllerHelmChart !== undefined) {
      this.ingressControllerHelmChart = ingressControllerHelmChart;
    }
    if (clusterSetupHelmChart !== undefined) {
      this.clusterSetupHelmChart = clusterSetupHelmChart;
    }
    if (certManagerHelmChart !== undefined) {
      this.certManagerHelmChart = certManagerHelmChart;
    }
    if (tss !== undefined) {
      this.tss = tss;
    }
  }
}
