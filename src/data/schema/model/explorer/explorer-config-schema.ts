// SPDX-License-Identifier: Apache-2.0

import {type HelmChartSchema} from '../common/helm-chart-schema.js';
import {Exclude, Expose} from 'class-transformer';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class ExplorerConfigSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);
  public static readonly EMPTY: ExplorerConfigSchema = new ExplorerConfigSchema(
    ExplorerConfigSchema.SCHEMA_VERSION.value,
  );

  @Expose()
  public schemaVersion: number;

  @Expose()
  public helmChart: HelmChartSchema | undefined;

  @Expose()
  public ingressControllerHelmChart: HelmChartSchema | undefined;

  public constructor(
    schemaVersion?: number,
    helmChart?: HelmChartSchema,
    ingressControllerHelmChart?: HelmChartSchema,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart ?? undefined;
    this.ingressControllerHelmChart = ingressControllerHelmChart ?? undefined;
  }
}
