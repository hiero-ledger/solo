// SPDX-License-Identifier: Apache-2.0

import {type Lock} from '../../core/lock/lock.js';

export interface LeaseWrapper {
  lease: Lock;
}
