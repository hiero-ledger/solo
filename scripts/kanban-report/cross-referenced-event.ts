// SPDX-License-Identifier: Apache-2.0

import {type CrossReferencedSource} from './cross-referenced-source.js';

export interface CrossReferencedEvent {
  event: 'cross-referenced';
  created_at: string;
  source: CrossReferencedSource;
}
