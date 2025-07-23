// SPDX-License-Identifier: Apache-2.0

import {GetKubeConfigOptions} from './get-kubeconfig-options.js';

export class GetKubeConfigOptionsBuilder {
  private constructor(
    private _name?: string,
    private _internal?: boolean,
  ) {}

  public static builder(): GetKubeConfigOptionsBuilder {
    return new GetKubeConfigOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): GetKubeConfigOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to use internal or external address (default false).
   * @param internal
   */
  public internal(internal: boolean): GetKubeConfigOptionsBuilder {
    this._internal = internal;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): GetKubeConfigOptions {
    return new GetKubeConfigOptions(this._name, this._internal);
  }

  public static from(options: GetKubeConfigOptions): GetKubeConfigOptionsBuilder {
    if (!options) {
      return new GetKubeConfigOptionsBuilder();
    }
    return new GetKubeConfigOptionsBuilder(options.name, options.internal);
  }
}
