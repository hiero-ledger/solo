// SPDX-License-Identifier: Apache-2.0

import {type KindRequest} from '../kind-request.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type LoadDockerImageOptions} from '../../model/load-docker-image/load-docker-image-options.js';

/**
 * A request to list all Kind clusters.
 */
export class LoadDockerImageRequest implements KindRequest {
  public constructor(private readonly options?: LoadDockerImageOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('load', 'docker-image');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
