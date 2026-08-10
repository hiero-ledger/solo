// SPDX-License-Identifier: Apache-2.0

import {type AssignedEvent} from './assigned-event.js';
import {type CrossReferencedEvent} from './cross-referenced-event.js';
import {type LabeledEvent} from './labeled-event.js';
import {type OtherEvent} from './other-event.js';
import {type UnassignedEvent} from './unassigned-event.js';
import {type UnlabeledEvent} from './unlabeled-event.js';

export type TimelineEvent =
  AssignedEvent | UnassignedEvent | LabeledEvent | UnlabeledEvent | CrossReferencedEvent | OtherEvent;
