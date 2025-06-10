// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';
import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';

export class SoloConfigV1Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(0);
  }

  public get version(): Version<number> {
    return new Version(1);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    const clone: any = structuredClone(source);

    if (clone.schemaVersion && clone.schemaVersion !== 0) {
      // this case should never happen considering the field was not present in version 0 and should default to zero
      // during this migration
      throw new InvalidSchemaVersionError(clone.schemaVersion, 0);
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    if (!clone.helmChart) {
      clone.helmChart = this.getNewHelmChartObject();
    }

    if (!clone.ingressControllerHelmChart) {
      clone.ingressControllerHelmChart = this.getNewHelmChartObject();
    }

    if (!clone.clusterSetupHelmChart) {
      clone.clusterSetupHelmChart = this.getNewHelmChartObject();
    }

    if (!clone.certManagerHelmChart) {
      clone.certManagerHelmChart = this.getNewHelmChartObject();
    }

    return clone;
  }

  private getNewHelmChartObject(): object {
    return {
      name: undefined,
      namespace: undefined,
      release: undefined,
      repository: undefined,
      directory: undefined,
      version: undefined,
      labelSelector: undefined,
      containerName: undefined,
      ingressClassName: undefined,
      ingressControllerName: undefined,
      ingressControllerPrefix: undefined,
    };
  }
}
