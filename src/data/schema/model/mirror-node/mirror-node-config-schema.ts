// SPDX-License-Identifier: Apache-2.0

import {type HelmChartSchema} from '../common/helm-chart-schema.js';
import {Exclude, Expose} from 'class-transformer';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class MirrorNodeConfigSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);
  public static readonly EMPTY: MirrorNodeConfigSchema = new MirrorNodeConfigSchema(
    MirrorNodeConfigSchema.SCHEMA_VERSION.value,
  );

  @Expose()
  public schemaVersion: number;

  @Expose()
  public helmChart: HelmChartSchema | undefined;

  public constructor(schemaVersion?: number, helmChart?: HelmChartSchema) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart ?? undefined;
  }
}
