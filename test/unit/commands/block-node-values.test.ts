// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../../src/core/constants.js';

interface BlockNodePersistencePluginsConfig {
  size?: string;
  existingClaim?: string;
}

interface BlockNodePersistenceConfig {
  plugins?: BlockNodePersistencePluginsConfig;
}

interface BlockNodeValuesConfig {
  blockNode?: {
    persistence?: BlockNodePersistenceConfig;
  };
}

describe('Block node default values', (): void => {
  it('should not hardcode plugins existingClaim in default values', (): void => {
    const valuesContent: string = fs.readFileSync(constants.BLOCK_NODE_VALUES_FILE, 'utf8');
    const parsedValues: BlockNodeValuesConfig = yaml.parse(valuesContent) as BlockNodeValuesConfig;
    const pluginsPersistence: BlockNodePersistencePluginsConfig | undefined =
      parsedValues.blockNode?.persistence?.plugins;

    expect(pluginsPersistence, 'blockNode.persistence.plugins should be defined').to.not.equal(undefined);
    expect(pluginsPersistence?.size, 'blockNode.persistence.plugins.size').to.equal('1Gi');
    expect(pluginsPersistence?.existingClaim, 'plugins existingClaim must remain unset by default').to.equal(undefined);
  });
});
