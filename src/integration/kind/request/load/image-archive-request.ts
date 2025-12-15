// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type LoadImageArchiveOptions} from '../../model/load-image-archive/load-image-archive-options.js';

/**
 * A request to list all Kind clusters.
 */
export class LoadImageArchiveRequest implements KindRequest {
  public constructor(private readonly options?: LoadImageArchiveOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('load', 'image-archive');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
