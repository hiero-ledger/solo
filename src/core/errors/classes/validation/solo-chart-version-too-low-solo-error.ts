// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class SoloChartVersionTooLowSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(actualVersion: string, minimumVersion: string) {
    super({
      message: `solo-charts version ${actualVersion} is below the supported minimum ${minimumVersion}`,
      code: ErrorCodeRegistry.SOLO_CHART_VERSION_TOO_LOW,
      troubleshootingSteps:
        `Use solo-charts >= ${minimumVersion}: solo <command> --solo-chart-version ${minimumVersion}\n` +
        'Or unset --solo-chart-version to fall back to the bundled default.',
    });
  }
}
