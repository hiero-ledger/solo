// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';

@Exclude()
export class WrapsSchema {
  @Expose()
  public artifactsFolderName: string = 'wraps-v0.2.0';

  @Expose()
  public directoryName: string = 'wraps-v0.2.0';

  @Expose()
  public allowedKeyFiles: string = 'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin';

  // IMPORTANT: libraryDownloadUrl must be kept consistent with directoryName.
  // If directoryName is updated, update libraryDownloadUrl to match.
  @Expose()
  public libraryDownloadUrl: string = 'https://builds.hedera.com/tss/hiero/wraps/v0.2/wraps-v0.2.0.tar.gz';

  public constructor(
    artifactsFolderName?: string,
    directoryName?: string,
    allowedKeyFiles?: string,
    libraryDownloadUrl?: string,
  ) {
    if (artifactsFolderName !== undefined) {
      this.artifactsFolderName = artifactsFolderName;
    }
    if (directoryName !== undefined) {
      this.directoryName = directoryName;
    }
    if (allowedKeyFiles !== undefined) {
      this.allowedKeyFiles = allowedKeyFiles;
    }
    if (libraryDownloadUrl !== undefined) {
      this.libraryDownloadUrl = libraryDownloadUrl;
    }
  }
}

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
