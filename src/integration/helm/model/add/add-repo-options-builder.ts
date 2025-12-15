// SPDX-License-Identifier: Apache-2.0

import {AddRepoOptions} from './add-repo-options.js';

/**
 * Builder for AddRepoOptions for helm repo add command.
 */
export class AddRepoOptionsBuilder {
  private _forceUpdate: boolean = false;

  /**
   * Set whether to use --force-update.
   * @param forceUpdate If true, adds --force-update to the command.
   * @returns this builder
   */
  public forceUpdate(forceUpdate: boolean): AddRepoOptionsBuilder {
    this._forceUpdate = forceUpdate;
    return this;
  }

  /**
   * Build the AddRepoOptions instance.
   */
  public build(): AddRepoOptions {
    return new AddRepoOptions(this._forceUpdate);
  }
}
