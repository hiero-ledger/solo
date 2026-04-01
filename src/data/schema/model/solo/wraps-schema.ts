// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

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
