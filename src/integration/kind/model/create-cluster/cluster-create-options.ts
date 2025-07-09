// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `helm repo add` command.
 */
export class ClusterCreateOptions implements Options {
  /**
   * If set, pass config to the kind create cluster command.
   */
  private readonly _config: string;

  /**
   * The Docker image to use for booting the cluster.
   */
  private readonly _image: string;

  /**
   * The name of the cluster.
   */
  private readonly _name: string;

  /**
   * If set, retain nodes for debugging when cluster creation fails.
   */
  private readonly _retain: boolean;

  /**
   * The duration to wait for the control plane node to be ready.
   */
  private readonly _wait: string;

  constructor(config?: string, image?: string, name?: string, retain: boolean = false, wait?: string) {
    if (config) {
      this._config = config;
    }
    if (image) {
      this._image = image;
    }
    if (name) {
      this._name = name;
    }
    this._retain = retain;
    if (wait) {
      this._wait = wait;
    }
  }

  /**
   * Apply the options to the HelmExecutionBuilder.
   * @param builder The HelmExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._config) {
      builder.argument('config', this._config);
    }
    if (this._image) {
      builder.argument('image', this._image);
    }
    if (this._name) {
      builder.argument('name', this._name);
    }
    if (this._retain) {
      builder.flag('retain');
    }
    if (this._wait) {
      builder.argument('wait', this._wait);
    }
  }

  /**
   * The value of the config flag.
   */
  get config(): string {
    return this._config;
  }

  /**
   * The Docker image to use for booting the cluster.
   */
  get image(): string {
    return this._image;
  }

  /**
   * The name of the cluster.
   */
  get name(): string {
    return this._name;
  }

  /**
   * If set, retain nodes for debugging when cluster creation fails.
   */
  get retain(): boolean {
    return this._retain;
  }

  /**
   * The duration to wait for the control plane node to be ready.
   */
  get wait(): string {
    return this._wait;
  }
}
