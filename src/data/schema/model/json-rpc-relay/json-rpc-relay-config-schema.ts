// SPDX-License-Identifier: Apache-2.0

import {HelmChartSchema} from '../common/helm-chart-schema.js';
import {Exclude, Expose, Type} from 'class-transformer';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class JsonRpcRelayConfigSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);
  public static readonly EMPTY: JsonRpcRelayConfigSchema = new JsonRpcRelayConfigSchema(
    JsonRpcRelayConfigSchema.SCHEMA_VERSION.value,
  );

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => HelmChartSchema)
  public helmChart: HelmChartSchema | undefined;

  public constructor(schemaVersion?: number, helmChart?: HelmChartSchema) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart ?? undefined;
  }
}
