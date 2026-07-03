// SPDX-License-Identifier: Apache-2.0

import {LoadDockerImageOptions} from './load-docker-image-options.js';

export class LoadDockerImageOptionsBuilder {
  private constructor(
    private _name?: string,
    private _nodes?: string,
    private _imageNames?: readonly string[],
  ) {}

  public static builder(): LoadDockerImageOptionsBuilder {
    return new LoadDockerImageOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): LoadDockerImageOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set the nodes to load images into.
   * @param nodes
   */
  public nodes(nodes: string): LoadDockerImageOptionsBuilder {
    this._nodes = nodes;
    return this;
  }

  /**
   * Set a single image name to load.
   * @param imageName
   */
  public imageName(imageName: string): LoadDockerImageOptionsBuilder {
    this._imageNames = [imageName];
    return this;
  }

  /**
   * Set the image names to load (`kind load docker-image` accepts one or more).
   * @param imageNames
   */
  public imageNames(imageNames: readonly string[]): LoadDockerImageOptionsBuilder {
    this._imageNames = imageNames;
    return this;
  }

  /**
   * Build the LoadDockerImageOptions instance.
   */
  public build(): LoadDockerImageOptions {
    return new LoadDockerImageOptions(this._imageNames ?? [], this._name, this._nodes);
  }

  public static from(options: LoadDockerImageOptions): LoadDockerImageOptionsBuilder {
    if (!options) {
      return new LoadDockerImageOptionsBuilder();
    }
    return new LoadDockerImageOptionsBuilder(options.name, options.nodes, options.imageNames);
  }
}
