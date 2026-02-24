// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import 'dotenv/config';
// eslint-disable-next-line n/no-extraneous-import
import 'reflect-metadata';
import {SoloPinoLogger} from './src/core/logging/solo-pino-logger.js';
import {unlinkLocalSoloPackages} from './src/core/npm-utilities.js';
import {Container} from './src/core/dependency-injection/container-init.js';
import * as constants from './src/core/constants.js';
const logLevel: string = 'debug';

Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, logLevel);
await unlinkLocalSoloPackages(new SoloPinoLogger(logLevel, true));
