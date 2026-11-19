// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type HelmChartValues} from '../../integration/helm/model/values.js';

/** A `helm upgrade` that `ChartMigrator` runs the applicable chart migrations around. */
export interface ChartMigrationRequest {
  readonly namespace: NamespaceName;
  readonly releaseName: string;
  readonly kubeContext: string;

  /** The chart version to upgrade to; migrations are skipped when it is empty (Helm then picks the latest chart). */
  readonly targetVersion: string;

  /** The values Solo and the user supply for the upgrade. */
  readonly chartValues: HelmChartValues;

  /** Whether the caller asked Helm to reuse the values of the deployed release. */
  readonly reuseValues: boolean;
}
