// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {beforeEach} from 'mocha';
import {ClassToObjectMapper} from '../../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';
import {JsonRpcRelayConfigSchemaDefinition} from '../../../../../../src/data/schema/migration/impl/json-rpc-relay/json-rpc-relay-config-schema-definition.js';
import {JsonRpcRelayConfigSchema} from '../../../../../../src/data/schema/model/json-rpc-relay/json-rpc-relay-config-schema.js';
import {HelmChartSchema} from '../../../../../../src/data/schema/model/common/helm-chart-schema.js';
import {nullToUndefined} from '../../../../../test-utility.js';

describe('JsonRpcRelayConfig', () => {
  const schema: JsonRpcRelayConfigSchemaDefinition = new JsonRpcRelayConfigSchemaDefinition(
    new ClassToObjectMapper(ConfigKeyFormatter.instance()),
  );
  const jsonRpcRelayVersion: string = '0-36-0';
  const jsonRpcRelayConfigPath = `test/data/v${jsonRpcRelayVersion}-json-rpc-relay-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(jsonRpcRelayConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = nullToUndefined(parse(yamlData));
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const jrrc = await schema.transform(plainObject);
      expect(jrrc).to.not.be.undefined.and.to.not.be.null;
      expect(jrrc).to.be.instanceOf(JsonRpcRelayConfigSchema);
      expect(typeof jrrc.schemaVersion).to.eq('number');

      // Verify helmChart properties
      expect(jrrc.helmChart).to.be.instanceOf(HelmChartSchema);
      expect(jrrc.helmChart.name).to.eq('json-rpc-relay-deployment');
      expect(jrrc.helmChart.release).to.eq('json-rpc-relay-deployment');
      expect(jrrc.helmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');
    });

    it('should transform class to plain', async () => {
      const helmChart = new HelmChartSchema(
        'json-rpc-relay-deployment',
        undefined,
        'json-rpc-relay-deployment',
        'oci://ghcr.io/hashgraph/solo-charts',
      );

      const jrrc = new JsonRpcRelayConfigSchema(1, helmChart);

      const newPlainObject: object = instanceToPlain(jrrc);

      expect(newPlainObject).to.not.be.undefined.and.to.not.be.null;

      const transformed = await schema.transform(plainObject);
      const poClone = instanceToPlain(transformed);
      expect(newPlainObject).to.deep.equal(poClone);

      const yaml: string = stringify(newPlainObject, {sortMapEntries: true});
      expect(yaml).to.not.be.undefined.and.to.not.be.null;
      expect(yaml).to.not.be.empty;
      expect(yaml).to.equal(stringify(poClone, {sortMapEntries: true}));
    });
  });
});