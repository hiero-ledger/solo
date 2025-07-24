// SPDX-License-Identifier: Apache-2.0

import {ClusterCreateOptions} from './cluster-create-options.js';

export class ClusterCreateOptionsBuilder {
  private constructor(
    private _config?: string,
    private _image?: string,
    private _name?: string,
    private _retain: boolean = false,
    private _wait?: string,
  ) {}

  public static builder(): ClusterCreateOptionsBuilder {
    return new ClusterCreateOptionsBuilder();
  }

  /**
   * Set the configuration file for the cluster.
   * @param config
   */
  public config(config: string): ClusterCreateOptionsBuilder {
    this._config = config;
    return this;
  }

  /**
   * Set the Docker image to use for booting the cluster.
   * @param image
   */
  public image(image: string): ClusterCreateOptionsBuilder {
    this._image = image;
    return this;
  }

  /**
   * Set the name of the cluster.
   * @param name
   */
  public name(name: string): ClusterCreateOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to retain the cluster after deletion.
   * @param retain
   */
  public retain(retain: boolean): ClusterCreateOptionsBuilder {
    this._retain = retain;
    return this;
  }

  /**
   * Set the wait time for the cluster to be ready.
   * @param wait
   */
  public wait(wait: string): ClusterCreateOptionsBuilder {
    this._wait = wait;
    return this;
  }

  /**
   * Build the ClusterCreateOptions instance.
   */
  public build(): ClusterCreateOptions {
    return new ClusterCreateOptions(this._config, this._image, this._name, this._retain, this._wait);
  }

  public static from(options: ClusterCreateOptions): ClusterCreateOptionsBuilder {
    if (!options) {
      return new ClusterCreateOptionsBuilder();
    }
    return new ClusterCreateOptionsBuilder(options.config, options.image, options.name, options.retain, options.wait);
  }
}
