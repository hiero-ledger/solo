// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Comparators} from '../../../../src/business/utils/comparators.js';
import {type ConfigSource} from '../../../../src/data/configuration/spi/config-source.js';
import {SimpleConfigSourceFixture} from '../../fixtures/simple-config-source.fixture.js';

describe('Comparators', () => {
  describe('number comparator', () => {
    it('should return -1 when the first number is less than the second', () => {
      expect(Comparators.number(1, 2)).to.equal(-1);
    });

    it('should return 1 when the first number is greater than the second', () => {
      expect(Comparators.number(3, 2)).to.equal(1);
    });

    it('should return 0 when the numbers are equal', () => {
      expect(Comparators.number(2, 2)).to.equal(0);
    });
  });

  describe('configSource comparator', () => {
    let configSource1: ConfigSource, configSource2: ConfigSource;

    before(() => {
      configSource1 = new SimpleConfigSourceFixture(
        'simpleConfigSource1',
        1,
        'simpleConfigSource1',
        undefined,
        new Map<string, string>(),
      );

      configSource2 = new SimpleConfigSourceFixture(
        'simpleConfigSource2',
        2,
        'simpleConfigSource2',
        undefined,
        new Map<string, string>(),
      );
    });

    it('should return -1 when the first configSource ordinal is less than the second', () => {
      expect(Comparators.configSource(configSource1, configSource2)).to.equal(-1);
    });

    it('should return 1 when the first configSource ordinal is greater than the second', () => {
      expect(Comparators.configSource(configSource2, configSource1)).to.equal(1);
    });

    it('should return 0 when the configSource ordinals are equal', () => {
      expect(Comparators.configSource(configSource1, configSource1)).to.equal(0);
    });
  });
});
