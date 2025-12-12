// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import {KindKubeConfig} from './kubeconfig/kind-kubeconfig.js';
import {KindKubeConfigCluster} from './kubeconfig/kind-kubeconfig-custer.js';
import {KindKubeConfigClusterData} from './kubeconfig/kind-kubeconfig-custer-data.js';
import {KindKubeConfigContext} from './kubeconfig/kind-kubeconfig-context.js';
import {KindKubeConfigContextData} from './kubeconfig/kind-kubeconfig-context-data.js';
import {KindKubeConfigUser} from './kubeconfig/kind-kubeconfig-user.js';
import {KindKubeConfigUserData} from './kubeconfig/kind-kubeconfig-user-data.js';
import {KindParserException} from '../../errors/kind-parser-exception.js';

/**
 * Represents a parsed kubeconfig response from Kind
 */
export class GetKubeConfigResponse {
  protected readonly _rawOutput: string;
  private readonly _config: KindKubeConfig;

  public constructor() {
    // eslint-disable-next-line prefer-rest-params
    this._rawOutput = [...arguments].join('\n');

    try {
      // Parse the YAML output
      const config: any = yaml.parse(this._rawOutput);
      this._config = new KindKubeConfig(
        config.apiVersion,
        config.clusters.map((cluster: any): KindKubeConfigCluster => {
          return new KindKubeConfigCluster(
            new KindKubeConfigClusterData(cluster.cluster['certificate-authority-data'], cluster.cluster.server),
            cluster.name,
          );
        }) || [],
        config.contexts.map((context: any): KindKubeConfigContext => {
          return new KindKubeConfigContext(
            new KindKubeConfigContextData(context.context.cluster, context.context.user),
            context.name,
          );
        }) || [],
        config['current-context'] || '',
        config.kind,
        config.preferences || {},
        config.users.map((user: any): KindKubeConfigUser => {
          return new KindKubeConfigUser(
            new KindKubeConfigUserData(user.user['client-certificate-data'], user.user['client-key-data']),
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
  public get config(): KindKubeConfig {
    return this._config;
  }
}
