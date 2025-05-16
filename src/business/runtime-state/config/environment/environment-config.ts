// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type EnvironmentConfigSchema} from '../../../../data/schema/model/environment/environment-config-schema.js';

export class EnvironmentConfig implements Facade<EnvironmentConfigSchema> {
  private readonly _chartsDirectory: string;

  public constructor(public readonly encapsulatedObject: EnvironmentConfigSchema) {
    this._chartsDirectory = encapsulatedObject.chartsDirectory ?? undefined;
  }

  public get chartsDirectory(): string {
    return this._chartsDirectory;
  }
}
