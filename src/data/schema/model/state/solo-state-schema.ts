// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class SoloStateSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  public chartsDirectory: string;

  public constructor(schemaVersion?: number, chartsDirectory?: string) {
    this.schemaVersion = schemaVersion ?? 1;
    this.chartsDirectory = chartsDirectory ?? undefined;
  }
}
