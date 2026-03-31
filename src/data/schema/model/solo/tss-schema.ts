// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class WrapsSchema {
  @Expose()
  public artifactsFolderName: string | undefined;

  @Expose()
  public directoryName: string | undefined;

  @Expose()
  public allowedKeyFiles: string | undefined;

  // IMPORTANT: libDownloadUrl must be kept consistent with directoryName.
  // If directoryName is updated, update libDownloadUrl to match.
  @Expose()
  public libDownloadUrl: string | undefined;

  public constructor(
    artifactsFolderName?: string,
    directoryName?: string,
    allowedKeyFiles?: string,
    libDownloadUrl?: string,
  ) {
    this.artifactsFolderName = artifactsFolderName ?? undefined;
    this.directoryName = directoryName ?? undefined;
    this.allowedKeyFiles = allowedKeyFiles ?? undefined;
    this.libDownloadUrl = libDownloadUrl ?? undefined;
  }
}

@Exclude()
export class TssSchema {
  @Expose()
  public messageSizeSoftLimitBytes: number | undefined;

  @Expose()
  public messageSizeHardLimitBytes: number | undefined;

  @Expose()
  public timeoutAfterReadySeconds: number | undefined;

  @Expose()
  public readyMaxAttempts: number | undefined;

  @Expose()
  public readyBackoffSeconds: number | undefined;

  @Expose()
  public wraps: WrapsSchema | undefined;

  public constructor(
    messageSizeSoftLimitBytes?: number,
    messageSizeHardLimitBytes?: number,
    timeoutAfterReadySeconds?: number,
    readyMaxAttempts?: number,
    readyBackoffSeconds?: number,
    wraps?: WrapsSchema,
  ) {
    this.messageSizeSoftLimitBytes = messageSizeSoftLimitBytes ?? undefined;
    this.messageSizeHardLimitBytes = messageSizeHardLimitBytes ?? undefined;
    this.timeoutAfterReadySeconds = timeoutAfterReadySeconds ?? undefined;
    this.readyMaxAttempts = readyMaxAttempts ?? undefined;
    this.readyBackoffSeconds = readyBackoffSeconds ?? undefined;
    this.wraps = wraps ?? undefined;
  }
}
