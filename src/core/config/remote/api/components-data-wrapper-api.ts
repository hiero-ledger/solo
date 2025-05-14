// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../enumerations/component-types.js';

export interface ComponentsDataWrapperApi {
  removeById(componentType: ComponentTypes, id: number): Promise<void>;
}
