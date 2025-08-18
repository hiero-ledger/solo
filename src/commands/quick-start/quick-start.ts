// SPDX-License-Identifier: Apache-2.0

import {type BaseCommand} from '../base.js';

export interface QuickStartCommand extends BaseCommand {
  close(): Promise<void>;
}
