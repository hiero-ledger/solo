// SPDX-License-Identifier: Apache-2.0

import {GetKubeconfigOptions} from './get-kubeconfig-options.js';

export class GetKubeconfigOptionsBuilder {
  private constructor(
    private _name?: string,
    private _internal?: boolean,
  ) {}

  public static builder(): GetKubeconfigOptionsBuilder {
    return new GetKubeconfigOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): GetKubeconfigOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to use internal or external address (default false).
   * @param internal
   */
  public internal(internal: boolean): GetKubeconfigOptionsBuilder {
    this._internal = internal;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): GetKubeconfigOptions {
    return new GetKubeconfigOptions(this._name, this._internal);
  }

  public static from(options: GetKubeconfigOptions): GetKubeconfigOptionsBuilder {
    if (!options) {
      return new GetKubeconfigOptionsBuilder();
    }
    return new GetKubeconfigOptionsBuilder(options.name, options.internal);
  }
}
