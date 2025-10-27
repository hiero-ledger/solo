// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../../../../../src/data/configuration/spi/config-source.js';
import {SimpleConfigSourceFixture} from '../../../fixtures/simple-config-source.fixture.js';
import {LayeredConfig} from '../../../../../src/data/configuration/impl/layered-config.js';
import {expect} from 'chai';
import {IllegalArgumentError} from '../../../../../src/business/errors/illegal-argument-error.js';
import {DuplicateConfigSourceError} from '../../../../../src/data/configuration/api/duplicate-config-source-error.js';

class SimpleObject {
  public constructor(
    public properties1?: string,
    public properties2?: number,
    public properties3?: boolean,
    public properties4?: string[],
  ) {}
}

describe('LayeredConfig', (): void => {
  let map1: Map<string, string>;
  let map2: Map<string, string>;
  let map3: Map<string, string>;
  let simpleConfigSourceOrdinal1: ConfigSource;
  let simpleConfigSourceOrdinal2: ConfigSource;
  let simpleConfigSourceOrdinal3: SimpleConfigSourceFixture;
  let layeredConfig: LayeredConfig;

  beforeEach((): void => {
    map1 = new Map<string, string>();
    map2 = new Map<string, string>();
    map3 = new Map<string, string>();
    map1.set('key1', 'map1key1value1');
    map1.set('key2', 'map1key2value2');
    map1.set('boolean', 'true');
    map1.set('stringArray', '["map1StringArray"]');
    map2.set('key2', 'map2key2value2');
    map2.set('key3', 'map2key2value3');
    map2.set('number', '42');
    map3.set('key3', 'map3key3value3');

    const simpleObject: SimpleObject = new SimpleObject('properties1', 42, true, ['properties4']);
    map2.set('simpleObject', JSON.stringify(simpleObject));
    map1.set('simpleObjectArray', JSON.stringify([simpleObject]));

    simpleConfigSourceOrdinal1 = new SimpleConfigSourceFixture(
      'simpleConfigSource1',
      1,
      'simpleConfigSource1',
      undefined,
      map1,
    );
    simpleConfigSourceOrdinal2 = new SimpleConfigSourceFixture(
      'simpleConfigSource2',
      2,
      'simpleConfigSource2',
      undefined,
      map2,
    );
    simpleConfigSourceOrdinal3 = new SimpleConfigSourceFixture(
      'simpleConfigSource3',
      3,
      'simpleConfigSource3',
      undefined,
      map3,
    );

    layeredConfig = new LayeredConfig([
      simpleConfigSourceOrdinal2,
      simpleConfigSourceOrdinal3,
      simpleConfigSourceOrdinal1,
    ]);
  });

  it('addSource should throw IllegalArgumentError if source is null', (): void => {
    // eslint-disable-next-line unicorn/no-null
    expect((): void => layeredConfig.addSource(null)).to.throw(IllegalArgumentError);

    // eslint-disable-next-line unicorn/no-useless-undefined
    expect((): void => layeredConfig.addSource(undefined)).to.throw(IllegalArgumentError);
  });

  it('addSource should throw DuplicateConfigSourceError if source is already present', (): void => {
    expect((): void => layeredConfig.addSource(simpleConfigSourceOrdinal3)).to.throw(DuplicateConfigSourceError);
  });

  it('addSource should not throw if source is not present', (): void => {
    const newSource: ConfigSource = new SimpleConfigSourceFixture(
      'newConfigSource',
      4,
      'newConfigSource',
      undefined,
      new Map<string, string>(),
    );

    const ordinalShiftedSource: ConfigSource = new SimpleConfigSourceFixture(
      'newConfigSource',
      5,
      'newConfigSource',
      undefined,
      new Map<string, string>(),
    );

    expect(layeredConfig.sources).to.have.lengthOf(3);
    expect(layeredConfig.sources).to.not.contain(newSource);
    expect((): void => layeredConfig.addSource(newSource)).to.not.throw();
    expect(layeredConfig.sources).to.have.lengthOf(4);
    expect(layeredConfig.sources).to.contain(newSource);

    expect(layeredConfig.sources).to.not.contain(ordinalShiftedSource);
    expect((): void => layeredConfig.addSource(ordinalShiftedSource)).to.not.throw();
    expect(layeredConfig.sources).to.have.lengthOf(5);
    expect(layeredConfig.sources).to.contain(ordinalShiftedSource);

    expect((): void => layeredConfig.addSource(newSource)).to.throw(DuplicateConfigSourceError);
  });

  it('should sort sources by ordinal', (): void => {
    const propertyMap: Map<string, string> = layeredConfig.properties();
    expect(propertyMap.get('key1')).to.equal('map1key1value1');
    expect(propertyMap.get('key2')).to.equal('map2key2value2');
    expect(propertyMap.get('key3')).to.equal('map3key3value3');
  });

  it('should return the correct property names', (): void => {
    const propertyNames: Set<string> = layeredConfig.propertyNames();
    expect(propertyNames.has('key1')).to.be.true;
    expect(propertyNames.has('key2')).to.be.true;
    expect(propertyNames.has('key3')).to.be.true;
  });

  it('should return the correct properties after a refresh', async (): Promise<void> => {
    simpleConfigSourceOrdinal3.props2 = new Map<string, string>([
      ['key1', 'map3key1value1'],
      ['key2', 'map3key2value2'],
      ['key3', 'map3key3value3'],
      ['key4', 'map3key4value4'],
    ]);
    await layeredConfig.refresh();
    const propertyMap: Map<string, string> = layeredConfig.properties();
    expect(propertyMap.get('key1')).to.equal('map3key1value1');
    expect(propertyMap.get('key2')).to.equal('map3key2value2');
    expect(propertyMap.get('key3')).to.equal('map3key3value3');
    expect(propertyMap.get('key4')).to.equal('map3key4value4');
  });

  it('should return as a boolean', (): void => {
    expect(layeredConfig.asBoolean('boolean')).to.be.true;
  });

  it('should return as a number', (): void => {
    expect(layeredConfig.asNumber('number')).to.equal(42);
  });

  it('should return as a string', (): void => {
    expect(layeredConfig.asString('key3')).to.equal('map3key3value3');
  });

  it('should return a string array', (): void => {
    expect(layeredConfig.asStringArray('stringArray')).to.eql(['map1StringArray']);
  });

  it('should return an object', (): void => {
    const simpleObject: SimpleObject = layeredConfig.asObject(SimpleObject, 'simpleObject');
    expect(simpleObject.properties1).to.equal('properties1');
    expect(simpleObject.properties2).to.equal(42);
    expect(simpleObject.properties3).to.be.true;
    expect(simpleObject.properties4).to.eql(['properties4']);
  });

  it('should return an object array', (): void => {
    const simpleObjectArray: SimpleObject[] = layeredConfig.asObjectArray(SimpleObject, 'simpleObjectArray');
    expect(simpleObjectArray[0].properties1).to.equal('properties1');
    expect(simpleObjectArray[0].properties2).to.equal(42);
    expect(simpleObjectArray[0].properties3).to.be.true;
    expect(simpleObjectArray[0].properties4).to.eql(['properties4']);
  });

  it('primitiveScalar should throw IllegalArgumentError', (): void => {
    // @ts-expect-error - testing private method
    // eslint-disable-next-line unicorn/no-null
    expect((): string => layeredConfig.primitiveScalar<string>(layeredConfig.asString, 'key3', null)).to.throw(
      'Unsupported scalar type',
    );
  });
});
