// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind get nodes` command.
 */
export class GetKubeConfigOptions implements Options {
  /**
   * The name of the cluster context name (default "kind")
   */
  private readonly _name: string;

  /**
   * Use internal or external address
   */
  private readonly _internal: boolean;

  public constructor(name?: string, internal: boolean = false) {
    if (name) {
      this._name = name;
    }

    this._internal = internal;
  }

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._name) {
      builder.argument('name', this._name);
    }
    if (this._internal) {
      builder.flag('--internal');
    }
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Whether to use internal or external address.
   */
  public get internal(): boolean {
    return this._internal;
  }
}
