/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import {type NodeAlias} from '../../types/aliases.js';
import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {SoloError} from '../../core/errors.js';
import {Namespace} from '../../core/config/remote/types.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';

export const connectConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(CONNECT_CONFIGS_NAME, argv.flags, [
    'currentDeploymentName',
  ]) as ClusterConnectConfigClass;

  // set config in the context for later tasks to use
  ctx.config = config;

  return ctx.config;
};

export const setupConfigBuilder = async function (argv, ctx, task) {
  const parent = this.parent;
  const configManager = parent.getConfigManager();
  configManager.update(argv);
  flags.disablePrompts([flags.chartDirectory]);

  await configManager.executePrompt(task, [
    flags.chartDirectory,
    flags.clusterSetupNamespace,
    flags.deployCertManager,
    flags.deployCertManagerCrds,
    flags.deployMinio,
    flags.deployPrometheusStack,
  ]);

  ctx.config = {
    chartDir: configManager.getFlag(flags.chartDirectory) as string,
    clusterSetupNamespace: configManager.getFlag(flags.clusterSetupNamespace) as string,
    deployCertManager: configManager.getFlag(flags.deployCertManager) as boolean,
    deployCertManagerCrds: configManager.getFlag(flags.deployCertManagerCrds) as boolean,
    deployMinio: configManager.getFlag(flags.deployMinio) as boolean,
    deployPrometheusStack: configManager.getFlag(flags.deployPrometheusStack) as boolean,
    soloChartVersion: configManager.getFlag(flags.soloChartVersion) as string,
  } as ClusterSetupConfigClass;

  parent.logger.debug('Prepare ctx.config', {config: ctx.config, argv});

  ctx.isChartInstalled = await parent
    .getChartManager()
    .isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);

  return ctx.config;
};

export const resetConfigBuilder = async function (argv, ctx, task) {
  if (!argv[flags.force.name]) {
    const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
      type: 'toggle',
      default: false,
      message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
    });

    if (!confirm) {
      // eslint-disable-next-line n/no-process-exit
      process.exit(0);
    }
  }

  this.parent.getConfigManager().update(argv);

  ctx.config = {
    clusterName: this.parent.getConfigManager().getFlag(flags.clusterName) as string,
    clusterSetupNamespace: this.parent.getConfigManager().getFlag(flags.clusterSetupNamespace) as string,
  } as ClusterResetConfigClass;

  ctx.isChartInstalled = await this.parent
    .getChartManager()
    .isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
  if (!ctx.isChartInstalled) {
    throw new SoloError('No chart found for the cluster');
  }

  return ctx.config;
};

export interface ClusterConnectConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  namespace: string;
  nodeAlias: NodeAlias;
  context: string;
  clusterName: string;
}

export interface ClusterSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: string;
  deployCertManager: boolean;
  deployCertManagerCrds: boolean;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
}

export interface ClusterResetConfigClass {
  clusterName: string;
  clusterSetupNamespace: string;
}

export interface SelectClusterContextContext {
  config: {
    quiet: boolean;
    namespace: Namespace;
    clusterName: string;
    context: string;
    clusters: string[];
  };
}
