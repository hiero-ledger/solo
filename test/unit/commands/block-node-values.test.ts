// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../../src/core/constants.js';

interface BlockNodePersistenceVolumeConfig {
  size?: string;
  existingClaim?: string;
}

interface BlockNodePersistenceConfig {
  archive?: BlockNodePersistenceVolumeConfig;
  live?: BlockNodePersistenceVolumeConfig;
  logging?: BlockNodePersistenceVolumeConfig;
}

interface BlockNodeValuesConfig {
  blockNode?: {
    persistence?: BlockNodePersistenceConfig;
  };
}

describe('Block node default values', (): void => {
  it('should not hardcode persistence existingClaim values in default values', (): void => {
    const valuesContent: string = fs.readFileSync(constants.BLOCK_NODE_VALUES_FILE, 'utf8');
    const parsedValues: BlockNodeValuesConfig = yaml.parse(valuesContent) as BlockNodeValuesConfig;
    const persistence: BlockNodePersistenceConfig | undefined = parsedValues.blockNode?.persistence;

    expect(persistence, 'blockNode.persistence should be defined').to.not.equal(undefined);
    expect(persistence?.archive?.size, 'blockNode.persistence.archive.size').to.equal('1Gi');
    expect(persistence?.live?.size, 'blockNode.persistence.live.size').to.equal('1Gi');
    expect(persistence?.logging?.size, 'blockNode.persistence.logging.size').to.equal('1Gi');
    expect(persistence?.archive?.existingClaim, 'archive existingClaim must remain unset by default').to.equal(
      undefined,
    );
    expect(persistence?.live?.existingClaim, 'live existingClaim must remain unset by default').to.equal(undefined);
    expect(persistence?.logging?.existingClaim, 'logging existingClaim must remain unset by default').to.equal(
      undefined,
    );
  });
});
