// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to read the user-supplied values of a deployed Helm release.
 */
export class ReleaseGetValuesRequest implements HelmRequest {
  public constructor(
    private readonly releaseName: string,
    private readonly namespace: string,
    private readonly kubeContext?: string,
  ) {}

  public apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');
    builder.argument('namespace', this.namespace);

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    builder.subcommands('get', 'values');
    builder.positional(this.releaseName);
  }
}
