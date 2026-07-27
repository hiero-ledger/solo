// SPDX-License-Identifier: Apache-2.0

import {type NetworkDeployedEvent} from './network-deployed-event.js';
import {type MirrorNodeDeployedEvent} from './mirror-node-deployed-event.js';
import {type NodesStartedEvent} from './nodes-started-event.js';
import {type BlockNodeDeployedEvent} from './block-node-deployed-event.js';

export type AnySoloEvent = NodesStartedEvent | NetworkDeployedEvent | MirrorNodeDeployedEvent | BlockNodeDeployedEvent;
