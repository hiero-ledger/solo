// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';

/**
 * Tracks whether the current execution is running inside a one-shot
 * command (deploy or destroy). When active, sub-commands skip their
 * own lease management because the parent one-shot command holds a
 * single lease for the entire operation.
 */
@injectable()
export class OneShotState {
  private _active: boolean = false;

  /** Returns true when execution is inside a one-shot command. */
  public isActive(): boolean {
    return this._active;
  }

  /** Mark one-shot mode as active. Called by one-shot deploy/destroy init. */
  public activate(): void {
    this._active = true;
  }

  /** Mark one-shot mode as inactive. Called in one-shot finally blocks. */
  public deactivate(): void {
    this._active = false;
  }
}
