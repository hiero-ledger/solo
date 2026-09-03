// SPDX-License-Identifier: Apache-2.0

import {type PvcReference} from './pvc-reference.js';

export interface Pvc {
  /**
   * The PVC (persistent volume claim) reference
   */
  readonly pvcReference: PvcReference;

  /**
   * The binding phase reported by Kubernetes, e.g. `Pending`, `Bound` or `Lost`. Undefined when the phase was not
   * requested or the API did not report one.
   */
  readonly phase?: string;
}
