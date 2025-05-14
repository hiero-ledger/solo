// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentId} from '../../../../types/index.js';

export interface ComponentDataApi {
  getNewComponentId(type: ComponentTypes): ComponentId;
  updateHighestComponentId(type: ComponentTypes): void;
}
