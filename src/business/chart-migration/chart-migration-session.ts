// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import yaml from 'yaml';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type SemanticVersion} from '../utils/semantic-version.js';
import {PathEx} from '../utils/path-ex.js';
import {FilePermissions} from '../utils/file-permissions.js';
import {type ChartMigrationContext} from './chart-migration-context.js';
import {type ChartMigrationRequest} from './chart-migration-request.js';

/** The state of one `helm upgrade` shared by the chart migrations that run around it. */
export class ChartMigrationSession implements ChartMigrationContext {
  public readonly namespace: NamespaceName;
  public readonly releaseName: string;
  public readonly kubeContext: string;

  private deployedValues: Record<string, unknown> | undefined;
  private carriedValues: Record<string, unknown> | undefined;
  private readonly inheritedValues: Record<string, unknown>[] = [];

  public constructor(
    private readonly helm: HelmClient,
    request: ChartMigrationRequest,
    public readonly chartName: string,
    public readonly currentVersion: SemanticVersion<string>,
    public readonly targetVersion: SemanticVersion<string>,
  ) {
    this.namespace = request.namespace;
    this.releaseName = request.releaseName;
    this.kubeContext = request.kubeContext;
  }

  public async releaseValues(): Promise<Record<string, unknown>> {
    return structuredClone(this.carriedValues ?? (await this.readDeployedValues()));
  }

  public carryReleaseValues(values: Record<string, unknown>): void {
    this.carriedValues = structuredClone(values);
  }

  public addInheritedValues(values: Record<string, unknown>): void {
    this.inheritedValues.push(structuredClone(values));
  }

  /** Whether a migration carried the release values, which replaces `--reuse-values`. */
  public get carriesReleaseValues(): boolean {
    return this.carriedValues !== undefined;
  }

  /** Whether a migration contributed any values to the upgrade. */
  public get hasValues(): boolean {
    return this.carriesReleaseValues || this.inheritedValues.length > 0;
  }

  /**
   * Writes the contributed values to owner-only files, since release values hold secrets such as database passwords.
   *
   * @param directory - an existing, owner-only directory the caller removes once Helm has read the files
   * @returns the `--values` arguments for the files, lowest precedence first
   */
  public writeValueFiles(directory: string): string[] {
    const documents: Record<string, unknown>[] = [
      ...(this.carriedValues ? [this.carriedValues] : []),
      ...this.inheritedValues,
    ];

    return documents.flatMap((values: Record<string, unknown>, index: number): string[] => {
      const valuesFilePath: string = PathEx.join(directory, `migration-values-${index}.yaml`);
      fs.writeFileSync(valuesFilePath, yaml.stringify(values), {mode: 0o600});
      FilePermissions.restrictToOwner(valuesFilePath, false);
      return ['--values', valuesFilePath];
    });
  }

  private async readDeployedValues(): Promise<Record<string, unknown>> {
    if (!this.deployedValues) {
      try {
        this.deployedValues = {...(await this.helm.getValues(this.releaseName, this.namespace.name, this.kubeContext))};
      } catch (error) {
        throw new SoloErrors.system.helmReleaseValuesReadFailed(this.releaseName, error);
      }
    }

    return this.deployedValues;
  }
}
