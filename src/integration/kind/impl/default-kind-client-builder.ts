// SPDX-License-Identifier: Apache-2.0

import {type KindClientBuilder} from '../kind-client-builder.js';
import {type KindClient} from '../kind-client.js';
import {DefaultKindClient} from './default-kind-client.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class DefaultKindClientBuilder implements KindClientBuilder {
  /**
   * The path to the Kind executable.
   * @private
   */
  private _executable: string;

  public constructor() {}

  /**
   * Set the Kind executable path.
   * @param executable The path to the Kind executable.
   * @returns This builder instance for method chaining.
   */
  public executable(executable: string): DefaultKindClientBuilder {
    this._executable = executable;
    return this;
  }

  public async build(): Promise<KindClient> {
    const client: DefaultKindClient = new DefaultKindClient(this._executable);
    await client.checkVersion();
    return client;
  }
}
