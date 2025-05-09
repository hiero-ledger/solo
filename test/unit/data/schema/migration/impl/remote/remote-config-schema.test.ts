// SPDX-License-Identifier: Apache-2.0

import {RemoteConfigSchema} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-schema.js';
import {RemoteConfigV1Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v1-migration.js';
import {type ObjectMapper} from '../../../../../../../src/data/mapper/api/object-mapper.js';
import {expect} from 'chai';
import {RemoteConfig} from '../../../../../../../src/data/schema/model/remote/remote-config.js';
import {type SchemaMigration} from '../../../../../../../src/data/schema/migration/api/schema-migration.js';

describe('RemoteConfigSchema', () => {
  let objectMapper: ObjectMapper;

  beforeEach(() => {
    // Mock ObjectMapper (can be a simple object as long as it's not used in logic)
    objectMapper = {} as ObjectMapper;
  });

  it('should instantiate without error', () => {
    expect(() => new RemoteConfigSchema(objectMapper)).not.to.throw();
  });

  it('should return the correct name', () => {
    const schema: RemoteConfigSchema = new RemoteConfigSchema(objectMapper);
    expect(schema.name).to.be.equal('RemoteConfig');
  });

  it('should return the correct version', () => {
    const schema: RemoteConfigSchema = new RemoteConfigSchema(objectMapper);
    expect(schema.version).equal(RemoteConfig.SCHEMA_VERSION);
  });

  it('should return the correct classCtor', () => {
    const schema: RemoteConfigSchema = new RemoteConfigSchema(objectMapper);
    expect(schema.classCtor).equal(RemoteConfig);
  });

  it('should return a migrations array containing RemoteConfigV1Migration', () => {
    const schema: RemoteConfigSchema = new RemoteConfigSchema(objectMapper);
    const migrations: SchemaMigration[] = schema.migrations;
    expect(Array.isArray(migrations)).equal(true);
    expect(migrations.length).equal(1);
    expect(migrations[0]).instanceOf(RemoteConfigV1Migration);
  });
});
