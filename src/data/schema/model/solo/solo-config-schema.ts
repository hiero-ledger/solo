// SPDX-License-Identifier: Apache-2.0

import {HelmChartSchema} from '../common/helm-chart-schema.js';
import {Exclude, Expose, Type} from 'class-transformer';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class SoloConfigSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);
  public static readonly EMPTY: SoloConfigSchema = new SoloConfigSchema(SoloConfigSchema.SCHEMA_VERSION.value);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => HelmChartSchema)
  public helmChart: HelmChartSchema | undefined;

  @Expose()
  @Type(() => HelmChartSchema)
  public ingressControllerHelmChart: HelmChartSchema | undefined;

  @Expose()
  @Type(() => HelmChartSchema)
  public clusterSetupHelmChart: HelmChartSchema | undefined;

  @Expose()
  @Type(() => HelmChartSchema)
  public certManagerHelmChart: HelmChartSchema | undefined;

  public constructor(
    schemaVersion?: number,
    helmChart?: HelmChartSchema,
    ingressControllerHelmChart?: HelmChartSchema,
    clusterSetupHelmChart?: HelmChartSchema,
    certManagerHelmChart?: HelmChartSchema,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart ?? undefined;
    this.ingressControllerHelmChart = ingressControllerHelmChart ?? undefined;
    this.clusterSetupHelmChart = clusterSetupHelmChart ?? undefined;
    this.certManagerHelmChart = certManagerHelmChart ?? undefined;
  }
}
