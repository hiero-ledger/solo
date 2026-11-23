// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

/** Thrown when the local source of a resumable copy gets shorter while it is split into chunks. */
export class KubeCopySourceChangedError extends KubeError {
  public readonly sourcePath: string;

  public constructor(sourcePath: string, chunkIndex: number) {
    super(
      `Source file ${sourcePath} changed while it was being read: it ended before chunk ${chunkIndex} was complete`,
      undefined,
      {sourcePath, chunkIndex},
    );
    this.sourcePath = sourcePath;
  }
}
