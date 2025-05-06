// SPDX-License-Identifier: Apache-2.0

import {Container} from '../src/core/dependency-injection/container-init.js';
import fs from 'node:fs';
import {type NamespaceNameAsString} from '../src/core/config/remote/types.js';
import * as yaml from 'yaml';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../src/core/constants.js';
import {PathEx} from '../src/business/utils/path-ex.js';
import {CommandInvoker} from './helpers/command-invoker.js';
import {Lifecycle} from 'tsyringe-neo';
import {SoloWinstonLogger} from '../src/core/logging/solo-winston-logger.js';

const CACHE_DIRECTORY = PathEx.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDirectory: string = CACHE_DIRECTORY, containerOverrides = {}) {
  // Register test-specific containers
  if (!containerOverrides['CommandInvoker']) {
    containerOverrides['CommandInvoker'] = [{useClass: CommandInvoker}, {lifecycle: Lifecycle.Singleton}];
  }

  if (!containerOverrides['SoloLogger']) {
    containerOverrides['SoloLogger'] = [{useValue: new SoloWinstonLogger('debug', true)}];
  }

  // For the test suites cacheDir === homeDir is acceptable because the data is temporary
  Container.getInstance().reset(cacheDirectory, cacheDirectory, 'debug', true, containerOverrides);
}

export function resetForTest(
  namespace?: NamespaceNameAsString,
  cacheDirectory: string = CACHE_DIRECTORY,
  resetLocalConfig: boolean = true,
  containerOverrides = {},
) {
  if (resetLocalConfig) {
    const localConfigFile = DEFAULT_LOCAL_CONFIG_FILE;
    if (!fs.existsSync(CACHE_DIRECTORY)) {
      fs.mkdirSync(CACHE_DIRECTORY, {recursive: true});
    }

    const localConfigData = fs.readFileSync(PathEx.joinWithRealPath('test', 'data', localConfigFile), 'utf8');
    const parsedData = yaml.parse(localConfigData);
    fs.writeFileSync(PathEx.join(CACHE_DIRECTORY, localConfigFile), yaml.stringify(parsedData));
  }
  // need to init the container prior to using K8Client for dependency injection to work
  resetTestContainer(cacheDirectory, containerOverrides);
}
