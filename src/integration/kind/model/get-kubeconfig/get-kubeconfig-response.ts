// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import {KindKubeconfig} from './kubeconfig/kind-kubeconfig.js';
import {KindKubeconfigCluster} from './kubeconfig/kind-kubeconfig-custer.js';
import {KindKubeconfigClusterData} from './kubeconfig/kind-kubeconfig-custer-data.js';
import {KindKubeconfigContext} from './kubeconfig/kind-kubeconfig-context.js';
import {KindKubeconfigContextData} from './kubeconfig/kind-kubeconfig-context-data.js';
import {KindKubeconfigUser} from './kubeconfig/kind-kubeconfig-user.js';
import {KindKubeconfigUserData} from './kubeconfig/kind-kubeconfig-user-data.js';
import {KindParserException} from '../../errors/kind-parser-exception.js';

/**
 * Represents a parsed kubeconfig response from Kind
 */
export class GetKubeconfigResponse {
  protected readonly _rawOutput: string;
  private readonly _config: KindKubeconfig;

  public constructor() {
    // eslint-disable-next-line prefer-rest-params
    this._rawOutput = Array.from(arguments).join('\n');

    try {
      // Parse the YAML output
      const config = yaml.parse(this._rawOutput);
      this._config = new KindKubeconfig(
        config.apiVersion,
        config.clusters.map((cluster: any) => {
          return new KindKubeconfigCluster(
            new KindKubeconfigClusterData(cluster.cluster['certificate-authority-data'], cluster.cluster.server),
            cluster.name,
          );
        }) || [],
        config.contexts.map((context: any) => {
          return new KindKubeconfigContext(
            new KindKubeconfigContextData(context.context.cluster, context.context.user),
            context.name,
          );
        }) || [],
        config['current-context'] || '',
        config.kind,
        config.preferences || {},
        config.users.map((user: any) => {
          return new KindKubeconfigUser(
            new KindKubeconfigUserData(user.user['client-certificate-data'], user.user['client-key-data']),
            user.name,
          );
        }) || [],
      );
    } catch {
      throw new KindParserException('Error parsing kubeconfig YAML');
    }
  }

  /**
   * Gets the raw kubeconfig content
   */
  public get rawOutput(): string {
    return this._rawOutput;
  }

  /**
   * Gets the full parsed config object
   */
  public get config(): any {
    return this._config;
  }
}
