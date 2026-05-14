// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

/**
 * The options to be supplied to the helm install command.
 *
 * @param atomic           - if set, the installation process deletes the installation on failure. The --wait flag will
 *                         be set automatically if --atomic is used.
 * @param createNamespace  - create the release namespace if not present.
 * @param dependencyUpdate - update dependencies if they are missing before installing the chart.
 * @param description      - add a custom description.
 * @param enableDNS        - enable DNS lookups when rendering templates.
 * @param force            - force resource updates through a replacement strategy.
 * @param passCredentials  - pass credentials to all domains.
 * @param password         - chart repository password where to locate the requested chart.
 * @param repo             - chart repository url where to locate the requested chart.
 * @param set              - set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
 * @param setLiteral       - set literal values on the command line.
 * @param setFile          - set values from files on the command line.
 * @param skipCrds         - if set, no CRDs will be installed. By default, CRDs are installed if not already present.
 * @param timeout          - time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
 * @param username         - chart repository username where to locate the requested chart.
 * @param values           - specify values in a YAML file or a URL (can specify multiple).
 * @param verify           - verify the package before installing it.
 * @param version          - specify a version constraint for the chart version to use. This constraint can be a
 *                         specific tag (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not
 *                         specified, the latest version is used.
 * @param waitFor          - if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a
 *                         Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as
 *                         successful. It will wait for as long as --timeout.
 * @param kubeContext      - the Kubernetes context to use.
 * @param namespace        - the namespace to install the chart in.
 */
export class InstallChartOptions implements Options {
  public constructor(
    /**
     * if set, the installation process deletes the installation on failure. The --wait flag will
     * be set automatically if --atomic is used.
     */
    public readonly atomic: boolean,

    /**
     * create the release namespace if not present.
     */
    public readonly createNamespace: boolean,

    /**
     * update dependencies if they are missing before installing the chart.
     */
    public readonly dependencyUpdate: boolean,

    /**
     * add a custom description.
     */
    public readonly description: string | null,

    /**
     * enable DNS lookups when rendering templates.
     */
    public readonly enableDNS: boolean,

    /**
     * force resource updates through a replacement strategy.
     */
    public readonly force: boolean,

    /**
     * pass credentials to all domains.
     */
    public readonly passCredentials: boolean,

    /**
     * chart repository password where to locate the requested chart.
     */
    public readonly password: string | null,

    /**
     * chart repository url where to locate the requested chart.
     */
    public readonly repo: string | null,

    /**
     * set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
     */
    public readonly set: string[] | null,

    /**
     * set literal values on the command line.
     */
    public readonly setLiteral: string[] | null,

    /**
     * set values from files on the command line.
     */
    public readonly setFile: string[] | null,

    /**
     * if set, no CRDs will be installed. By default, CRDs are installed if not already present.
     */
    public readonly skipCrds: boolean,

    /**
     * time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
     */
    public readonly timeout: string | null,

    /**
     * chart repository username where to locate the requested chart.
     */
    public readonly username: string | null,

    /**
     * specify values in a YAML file or a URL (can specify multiple).
     */
    public readonly values: string[] | null,

    /**
     * verify the package before installing it.
     */
    public readonly verify: boolean,

    /**
     * specify a version constraint for the chart version to use. This constraint can be a
     * specific tag (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not
     * specified, the latest version is used.
     */
    public readonly version: string | null,

    /**
     * if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a
     * Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as
     * successful. It will wait for as long as --timeout.
     */
    public readonly waitFor: boolean,

    /**
     * The Kubernetes context to use.
     */
    public readonly kubeContext: string | null,

    /**
     * The namespace to install the chart in.
     */
    public readonly namespace: string | null,
  ) {}

  public apply(builder: HelmExecutionBuilder): void {
    this.applyFlags(builder);

    builder.argument('output', 'json');

    if (this.password) {
      builder.argument('password', this.password);
    }

    if (this.repo) {
      builder.argument('repo', this.repo);
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

    if (this.timeout) {
      builder.argument('timeout', this.timeout);
    }

    if (this.username) {
      builder.argument('username', this.username);
    }

    if (this.values) {
      builder.optionsWithMultipleValues('values', this.values);
    }

    if (this.kubeContext) {
      builder.argument('kube-context', this.kubeContext);
    }

    if (this.namespace) {
      builder.argument('namespace', this.namespace);
    }

    if (this.version) {
      builder.argument('version', this.version);
    }
  }

  private applyFlags(builder: HelmExecutionBuilder): void {
    if (this.atomic) {
      builder.flag('--atomic');
    }

    if (this.createNamespace) {
      builder.flag('--create-namespace');
    }

    if (this.dependencyUpdate) {
      builder.flag('--dependency-update');
    }

    if (this.enableDNS) {
      builder.flag('--enable-dns');
    }

    if (this.force) {
      builder.flag('--force');
    }

    if (this.passCredentials) {
      builder.flag('--pass-credentials');
    }

    if (this.skipCrds) {
      builder.flag('--skip-crds');
    }

    if (this.verify) {
      builder.flag('--verify');
    }

    if (this.waitFor) {
      builder.flag('--wait');
    }
  }
}
