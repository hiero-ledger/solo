// SPDX-License-Identifier: Apache-2.0

import * as constants from '../core/constants.js';

export class ConsensusNodePathTemplates {
  static readonly BLOCK_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/blockStreams`;

  static readonly EVENT_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/eventsStreams`;

  static readonly RECORD_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/recordStreams`;

  static readonly DATA_ONBOARD: string = `${constants.HEDERA_HAPI_PATH}/data/onboard`;

  static readonly DATA_SAVED: string = `${constants.HEDERA_HAPI_PATH}/data/saved`;

  static readonly DATA_STATS: string = `${constants.HEDERA_HAPI_PATH}/data/stats`;

  static readonly DATA_UPGRADE: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade`;

  static readonly OUTPUT: string = `${constants.HEDERA_HAPI_PATH}/output`;

  static readonly DATA_CONFIG: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

  static readonly DATA_KEYS: string = `${constants.HEDERA_HAPI_PATH}/data/keys`;

  static readonly DATA_LIB: string = `${constants.HEDERA_HAPI_PATH}/data/lib`;

  static readonly DATA_APPS: string = `${constants.HEDERA_HAPI_PATH}/data/apps`;

  static readonly STATE: string = `${constants.HEDERA_HAPI_PATH}/state`;

  static readonly HEDERA_HAPI_PATH: string = `${constants.HEDERA_HAPI_PATH}/`;

  // ----- Config files -----

  static readonly BLOCK_NODES_JSON: string = `${this.DATA_CONFIG}/block-nodes.json`;

  static readonly GENESIS_NETWORK_JSON: string = `${this.DATA_CONFIG}/genesis-network.json`;

  static readonly GENESIS_THROTTLES_JSON: string = `${this.DATA_CONFIG}/genesis-throttles.json`;

  static readonly APPLICATION_PROPERTIES: string = `${this.DATA_CONFIG}/application.properties`;

  static readonly LOG4J2_XML: string = `${constants.HEDERA_HAPI_PATH}/log4j2.xml`;

  static readonly SETTINGS_TXT: string = `${constants.HEDERA_HAPI_PATH}/settings.txt`;
}
