// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

/**
 * Options for upgrading a Helm chart.
 */
export class UpgradeChartOptions implements Options {
  public constructor(
    /** the namespace where the release should be upgraded. */
    public readonly namespace?: string,

    /** the Kubernetes context to use. */
    public readonly kubeContext?: string,

    /** whether to reuse the last release's values. */
    public readonly reuseValues: boolean = false,

    /** values set on the command line. */
    public readonly set?: string[],

    /** literal values set on the command line. */
    public readonly setLiteral?: string[],

    /** file values set on the command line. */
    public readonly setFile?: string[],

    /** values files. */
    public readonly values?: string[],

    /** the version of the chart to upgrade to. */
    public readonly version?: string,

    /** whether to perform an install during upgrade if the release is not created */
    public readonly install: boolean = false,

    /** whether to create the namespace if it's not found */
    public readonly createNamespace: boolean = false,
  ) {}

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to.
   */
  public apply(builder: HelmExecutionBuilder): void {
    builder.argument('output', 'json');

    if (this.namespace) {
      builder.argument('namespace', this.namespace);
    }

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    if (this.reuseValues) {
      builder.flag('--reuse-values');
    }

    if (this.install) {
      builder.flag('--install');
    }

    if (this.createNamespace) {
      builder.flag('--create-namespace');
    }

    if (this.set) {
      builder.optionsWithMultipleValues('set', this.set);
    }

    if (this.setLiteral) {
      builder.optionsWithMultipleValues('set-literal', this.setLiteral);
    }

    if (this.setFile) {
      builder.optionsWithMultipleValues('set-file', this.setFile);
    }

    if (this.values) {
      builder.optionsWithMultipleValues('values', this.values);
    }

    if (this.version) {
      builder.argument('version', this.version);
    }
  }
}
