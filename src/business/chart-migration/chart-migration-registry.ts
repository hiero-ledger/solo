// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {type ChartMigration} from './chart-migration.js';

/**
 * The chart migrations Solo knows about. The order does not matter: `ChartMigrator` orders the migrations of an
 * upgrade by the boundary they cross.
 */
@injectable()
export class ChartMigrationRegistry {
  /** Add a migration by appending an instance of it here. */
  private readonly registered: readonly ChartMigration[] = [];

  /** Every registered chart migration. */
  public get migrations(): readonly ChartMigration[] {
    return this.registered;
  }

  /**
   * @param chartName - the chart name passed to `ChartManager.upgrade`
   * @returns the registered migrations for the chart
   */
  public migrationsFor(chartName: string): ChartMigration[] {
    return this.migrations.filter((migration: ChartMigration): boolean => migration.chartName === chartName);
  }
}
