// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

/**
 * Options for the `helm repo add` command.
 */
export class AddRepoOptions implements Options {
  /**
   * If set, pass --force-update to the helm repo add command.
   */
  private readonly _forceUpdate: boolean;

  public constructor(forceUpdate: boolean = false) {
    this._forceUpdate = forceUpdate;
  }

  /**
   * Apply the options to the HelmExecutionBuilder.
   * @param builder The HelmExecutionBuilder to apply options to.
   */
  public apply(builder: HelmExecutionBuilder): void {
    if (this._forceUpdate) {
      builder.flag('--force-update');
    }
  }

  /**
   * Whether --force-update will be set.
   */
  public get forceUpdate(): boolean {
    return this._forceUpdate;
  }
}
