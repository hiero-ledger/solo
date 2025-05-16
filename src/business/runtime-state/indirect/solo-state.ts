// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type LocalConfigSchema} from '../../../../data/schema/model/local/local-config-schema.js';
import {type SoloStateSchema} from '../../../data/schema/model/state/solo-state-schema.js';

export class SoloState implements Facade<SoloStateSchema> {
  private readonly _chartsDirectory: string;

  public constructor(public readonly encapsulatedObject: LocalConfigSchema) {
    this._chartsDirectory = encapsulatedObject.chartsDirectory ?? undefined;
  }

  public get chartsDirectory(): string {
    return this._chartsDirectory;
  }
}
