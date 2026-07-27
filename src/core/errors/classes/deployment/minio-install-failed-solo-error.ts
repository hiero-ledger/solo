// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during cluster setup when the MinIO Operator Helm chart fails to install;
 * the underlying failure is wrapped in `cause`. MinIO provides the S3-compatible object storage
 * that solo's cluster-level stack relies on, so its install is part of `solo cluster-ref config
 * setup`. The failure is usually a Helm error (bad chart version or values), an image that
 * cannot be pulled, or a cluster lacking the resources/connectivity to schedule the operator.
 */
export class MinioInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `MinIO Operator chart installation failed: ${cause.message}`,
        code: ErrorCodeRegistry.MINIO_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect cluster state: kubectl get pods -A\n' +
          'Check Helm release status: helm list -A\n' +
          'Verify cluster connectivity: kubectl cluster-info',
      },
      cause,
    );
  }
}
