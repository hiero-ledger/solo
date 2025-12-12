// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind cluster delete` command.
 */
export class ExportLogsOptions implements Options {
  /**
   * The name of the cluster context name (default "kind")
   */
  private readonly _name: string;

  public constructor(name?: string) {
    if (name) {
      this._name = name;
    }
  }

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._name) {
      builder.argument('name', this._name);
    }
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }
}
