// SPDX-License-Identifier: Apache-2.0

import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';
import {type BuildNodeImagesOptions} from '../../model/build-node-images/build-node-images-options.js';

export class BuildNodeImagesRequest {
  public constructor(private readonly options: BuildNodeImagesOptions) {}

  public apply(builder: KindExecutionBuilder): void {
    builder.subcommands('build', 'node-image');
    if (this.options) {
      this.options.apply(builder);
    }
  }
}
