// SPDX-License-Identifier: Apache-2.0

import {type HelmChartSchema} from '../common/helm-chart-schema.js';
import {Exclude, Expose} from 'class-transformer';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

@Exclude()
export class MirrorNodeConfigSchema {
  public static readonly SCHEMA_VERSION: SemanticVersion<number> = new SemanticVersion(1);
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
