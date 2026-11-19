// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Helm chart migration fails while upgrading a release across a chart version boundary;
 * the message names the migration and the release, and the underlying failure is wrapped in `cause`. solo runs chart
 * migrations to carry state the new chart no longer derives on its own, so the upgrade is stopped rather than run
 * without it — for example the release values or cluster state the migration reads could not be read.
 */
export class HelmChartMigrationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(migrationName: string, chartReleaseName: string, cause: Error) {
    super(
      {
        message: `Helm chart migration '${migrationName}' failed for release '${chartReleaseName}': ${cause.message}`,
        code: ErrorCodeRegistry.HELM_CHART_MIGRATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Inspect the release: helm get values ${chartReleaseName} -n <namespace>\n` +
          'Verify Kubernetes connectivity: kubectl cluster-info\n' +
          'If the failure persists, file a bug report: https://github.com/hiero-ledger/solo/issues',
      },
      cause,
    );
  }
}
