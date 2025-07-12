// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type BuildNodeImageType} from './build-node-image-type.js';

/**
 * Options for the `kind build node-image` command.
 */
export class BuildNodeImagesOptions implements Options {
  /**
   * The Docker image to use for building the node images.
   * @param _image name:tag of the resulting image to be built (default "kindest/node:latest")
   * @param _arch architecture to build for, defaults to the host architecture
   * @param _baseImage name:tag of the base image to use for the build (default "docker.io/kindest/base:v20250214-acbabc1a")
   * @param _type optionally specify one of 'url', 'file', 'release' or 'source' as the type of build
   */
  public constructor(
    private readonly _image?: string,
    private readonly _arch?: string,
    private readonly _baseImage?: string,
    private readonly _type?: BuildNodeImageType,
  ) {}

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._image) {
      builder.argument('image', this._image);
    }
    if (this._arch) {
      builder.argument('arch', this._arch);
    }
    if (this._baseImage) {
      builder.argument('base-image', this._baseImage);
    }
    if (this._type) {
      builder.argument('type', this._type);
    }
  }
}
