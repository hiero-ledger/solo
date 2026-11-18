// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ReleaseItem} from '../../integration/helm/model/release/release-item.js';
import {SemanticVersion} from '../utils/semantic-version.js';
import {PathEx} from '../utils/path-ex.js';
import {FilePermissions} from '../utils/file-permissions.js';
import {type ChartMigration} from './chart-migration.js';
import {type ChartMigrationRegistry} from './chart-migration-registry.js';
import {type ChartMigrationRequest} from './chart-migration-request.js';
import {type ChartUpgradeValues} from './chart-upgrade-values.js';
import {ChartMigrationSession} from './chart-migration-session.js';

/**
 * Runs the chart migrations that apply to a `helm upgrade` around it: every `beforeUpgrade` hook, then the upgrade with
 * the values the migrations contributed, then every `afterUpgrade` hook. See {@link ChartMigration} for when a
 * migration applies.
 */
@injectable()
export class ChartMigrator {
  public constructor(
    @inject(InjectTokens.Helm) private readonly helm?: HelmClient,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ChartMigrationRegistry) private readonly registry?: ChartMigrationRegistry,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.registry = patchInject(registry, InjectTokens.ChartMigrationRegistry, this.constructor.name);
  }

  /**
   * Upgrades a release, running the chart migrations that apply to it around the upgrade.
   *
   * @param request - the release, the target chart version and the values of the upgrade
   * @param upgradeChart - runs `helm upgrade` with the given values
   * @throws HelmChartMigrationFailedSoloError when a migration hook fails; the upgrade does not run if a
   *   `beforeUpgrade` hook fails
   */
  public async upgrade(
    request: ChartMigrationRequest,
    upgradeChart: (values: ChartUpgradeValues) => Promise<void>,
  ): Promise<void> {
    const session: ChartMigrationSession | undefined = await this.createSession(request);
    const migrations: ChartMigration[] = session
      ? this.registry
          .migrationsFor(request.chartName)
          .filter((migration: ChartMigration): boolean =>
            ChartMigrator.applies(migration, session.currentVersion, session.targetVersion),
          )
          // eslint-disable-next-line unicorn/no-array-sort
          .sort(ChartMigrator.byBoundary)
      : [];

    if (migrations.length === 0) {
      await upgradeChart({valueArguments: request.chartValues.toArguments(), reuseValues: request.reuseValues});
      return;
    }

    this.logger.info(
      `Applying chart migrations to release '${request.releaseName}' ` +
        `(${session.currentVersion} -> ${session.targetVersion}): ` +
        migrations.map((migration: ChartMigration): string => migration.name).join(', '),
    );

    for (const migration of migrations) {
      await this.runHook(migration, request, (): Promise<void> => migration.beforeUpgrade(session));
    }

    await this.upgradeWithMigratedValues(request, session, upgradeChart);

    for (const migration of migrations) {
      if (migration.afterUpgrade) {
        await this.runHook(migration, request, (): Promise<void> => migration.afterUpgrade(session));
      }
    }
  }

  /**
   * Creates the session of an upgrade whose chart has registered migrations, or returns undefined when no migration
   * can apply: the chart has none, the release is not installed yet, or either chart version is unknown.
   */
  private async createSession(request: ChartMigrationRequest): Promise<ChartMigrationSession | undefined> {
    if (this.registry.migrationsFor(request.chartName).length === 0) {
      return undefined;
    }

    const targetVersion: SemanticVersion<string> | undefined = ChartMigrator.parseVersion(request.targetVersion);
    if (!targetVersion) {
      this.logger.debug(
        `Skipping chart migrations for release '${request.releaseName}': target chart version '${request.targetVersion}' is not a semantic version`,
      );
      return undefined;
    }

    const releases: ReleaseItem[] = await this.helm.listReleases(false, request.namespace.name, request.kubeContext);
    const release: ReleaseItem | undefined = releases.find(
      (item: ReleaseItem): boolean => item.name === request.releaseName,
    );
    const currentVersion: SemanticVersion<string> | undefined = ChartMigrator.parseVersion(release?.chartVersion);
    if (!currentVersion) {
      this.logger.debug(
        `Skipping chart migrations for release '${request.releaseName}': no deployed chart version (chart: '${release?.chart}')`,
      );
      return undefined;
    }

    return new ChartMigrationSession(this.helm, request, currentVersion, targetVersion);
  }

  private async upgradeWithMigratedValues(
    request: ChartMigrationRequest,
    session: ChartMigrationSession,
    upgradeChart: (values: ChartUpgradeValues) => Promise<void>,
  ): Promise<void> {
    const valuesDirectory: string | undefined = session.hasValues
      ? fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-chart-migration-'))
      : undefined;

    try {
      if (valuesDirectory) {
        FilePermissions.restrictToOwner(valuesDirectory, true);
      }

      await upgradeChart({
        valueArguments: [
          ...(valuesDirectory ? session.writeValueFiles(valuesDirectory) : []),
          ...request.chartValues.toArguments(),
        ],
        reuseValues: request.reuseValues && !session.carriesReleaseValues,
      });
    } finally {
      if (valuesDirectory) {
        // the files hold the release's secrets and are only needed while Helm reads them
        fs.rmSync(valuesDirectory, {recursive: true, force: true});
      }
    }
  }

  private async runHook(
    migration: ChartMigration,
    request: ChartMigrationRequest,
    hook: () => Promise<void>,
  ): Promise<void> {
    try {
      await hook();
    } catch (error) {
      throw new SoloErrors.system.helmChartMigrationFailed(migration.name, request.releaseName, error);
    }
  }

  /** A migration applies when the deployed version lies in its range and the upgrade crosses the end of the range. */
  private static applies(
    migration: ChartMigration,
    currentVersion: SemanticVersion<string>,
    targetVersion: SemanticVersion<string>,
  ): boolean {
    return migration.range.contains(currentVersion) && targetVersion.greaterThanOrEqual(migration.range.end);
  }

  /** Orders migrations by the boundary they cross, so values are rewritten oldest boundary first. */
  private static byBoundary(left: ChartMigration, right: ChartMigration): number {
    return left.range.end.compare(right.range.end) || left.range.begin.compare(right.range.begin);
  }

  private static parseVersion(version: string | undefined): SemanticVersion<string> | undefined {
    if (!version) {
      return undefined;
    }

    try {
      return new SemanticVersion<string>(version);
    } catch {
      // not a semantic version (e.g. a chart tag such as 'latest'): no migration range can contain or cross it
      return undefined;
    }
  }
}
