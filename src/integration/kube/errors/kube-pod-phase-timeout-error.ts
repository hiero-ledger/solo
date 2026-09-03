// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

/**
 * Thrown when pods matching the selector were observed, but none of them reached the expected phase before the wait
 * budget expired. This is distinct from {@link KubePodNotFoundError}, which means no matching pod was ever seen —
 * conflating the two hides whether the pod is missing or merely not started yet.
 */
export class KubePodPhaseTimeoutError extends KubeError {
  public readonly resource: string;

  public constructor(
    resource: string,
    expectedPhases: string[],
    lastObservedPhase: string,
    diagnostics?: string,
    cause?: Error,
  ) {
    super(
      `Pod found for: ${resource}, but it did not reach phase [${expectedPhases.join(', ')}] ` +
        `before timing out; last observed phase: ${lastObservedPhase}` +
        (diagnostics ? `; ${diagnostics}` : ''),
      cause,
      {resource, expectedPhases, lastObservedPhase, diagnostics},
    );
    this.resource = resource;
  }
}
