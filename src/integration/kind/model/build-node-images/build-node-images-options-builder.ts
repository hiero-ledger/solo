// SPDX-License-Identifier: Apache-2.0

import {BuildNodeImagesOptions} from './build-node-images-options.js';
import {type BuildNodeImageType} from './build-node-image-type.js';

export class BuildNodeImagesOptionsBuilder {
  public constructor(
    private _image?: string,
    private _arch?: string,
    private _baseImage?: string,
    private _type?: BuildNodeImageType,
  ) {}

  public image(image: string): BuildNodeImagesOptionsBuilder {
    this._image = image;
    return this;
  }

  public arch(arch: string): BuildNodeImagesOptionsBuilder {
    this._arch = arch;
    return this;
  }

  public baseImage(baseImage: string): BuildNodeImagesOptionsBuilder {
    this._baseImage = baseImage;
    return this;
  }

  public type(type: BuildNodeImageType): BuildNodeImagesOptionsBuilder {
    this._type = type;
    return this;
  }

  public static builder(): BuildNodeImagesOptionsBuilder {
    return new BuildNodeImagesOptionsBuilder();
  }

  /**
   * Build the BuildNodeImagesOptions instance.
   */
  public build(): BuildNodeImagesOptions {
    return new BuildNodeImagesOptions(this._image, this._arch, this._baseImage, this._type);
  }
}
