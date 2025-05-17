// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  private readonly _chartsDirectory: string;

  public constructor(public readonly encapsulatedObject: SoloConfigSchema) {
    this._chartsDirectory = encapsulatedObject.chartsDirectory ?? undefined;
  }

  public get chartsDirectory(): string {
    return this._chartsDirectory;
  }
}
