// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {WrapsSchema} from './wraps-schema.js';

@Exclude()
export class TssSchema {
  @Expose()
  public messageSizeSoftLimitBytes: number = 4_194_304;

  @Expose()
  public messageSizeHardLimitBytes: number = 37_748_736;

  @Expose()
  public timeoutAfterReadySeconds: number = 10;

  @Expose()
  public readyMaxAttempts: number = 60;

  @Expose()
  public readyBackoffSeconds: number = 3;

  @Expose()
  @Type((): typeof WrapsSchema => WrapsSchema)
  public wraps: WrapsSchema = new WrapsSchema();

  public constructor(
    messageSizeSoftLimitBytes?: number,
    messageSizeHardLimitBytes?: number,
    timeoutAfterReadySeconds?: number,
    readyMaxAttempts?: number,
    readyBackoffSeconds?: number,
    wraps?: WrapsSchema,
  ) {
    if (messageSizeSoftLimitBytes !== undefined) {
      this.messageSizeSoftLimitBytes = messageSizeSoftLimitBytes;
    }
    if (messageSizeHardLimitBytes !== undefined) {
      this.messageSizeHardLimitBytes = messageSizeHardLimitBytes;
    }
    if (timeoutAfterReadySeconds !== undefined) {
      this.timeoutAfterReadySeconds = timeoutAfterReadySeconds;
    }
    if (readyMaxAttempts !== undefined) {
      this.readyMaxAttempts = readyMaxAttempts;
    }
    if (readyBackoffSeconds !== undefined) {
      this.readyBackoffSeconds = readyBackoffSeconds;
    }
    if (wraps !== undefined) {
      this.wraps = wraps;
    }
  }
}
