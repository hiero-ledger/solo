// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {type Version} from '../../../types/index.js';
import {type MigrationStruct} from './interfaces/migration-struct.js';
import {type UserIdentitySchema} from '../../../data/schema/model/common/user-identity-schema.js';

export class Migration implements MigrationStruct {
  private readonly _migratedAt: Date;
  private readonly _migratedBy: UserIdentitySchema;
  private readonly _fromVersion: Version;

  public constructor(migratedAt: Date, migratedBy: UserIdentitySchema, fromVersion: Version) {
    this._migratedAt = migratedAt;
    this._migratedBy = migratedBy;
    this._fromVersion = fromVersion;
    this.validate();
  }

  /* -------- Getters -------- */

  public get migratedAt(): Date {
    return this._migratedAt;
  }
  public get migratedBy(): UserIdentitySchema {
    return this._migratedBy;
  }
  public get fromVersion(): Version {
    return this._fromVersion;
  }

  /* -------- Utilities -------- */

  public validate(): void {
    if (!(this.migratedAt instanceof Date)) {
      throw new SoloError(`Invalid migratedAt: ${this.migratedAt}`);
    }

    if (
      !this.migratedBy ||
      !this.migratedBy.name ||
      !this.migratedBy.hostname ||
      typeof this.migratedBy.name !== 'string' ||
      typeof this.migratedBy.hostname !== 'string'
    ) {
      throw new SoloError(`Invalid migratedBy: ${this.migratedBy}`);
    }

    if (!this.fromVersion || typeof this.fromVersion !== 'string') {
      throw new SoloError(`Invalid fromVersion: ${this.fromVersion}`);
    }
  }

  public toObject(): MigrationStruct {
    return {
      migratedAt: this.migratedAt,
      migratedBy: this.migratedBy,
      fromVersion: this.fromVersion,
    };
  }
}
