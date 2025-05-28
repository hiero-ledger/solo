// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {beforeEach} from 'mocha';
import {ClassToObjectMapper} from '../../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';
import {
  ExplorerConfigSchemaDefinition
} from '../../../../../../src/data/schema/migration/impl/explorer/explorer-config-schema-definition.js';
import {ExplorerConfigSchema} from '../../../../../../src/data/schema/model/explorer/explorer-config-schema.js';
import {HelmChartSchema} from '../../../../../../src/data/schema/model/common/helm-chart-schema.js';
import {nullToUndefined} from '../../../../../test-utility.js';

describe('ExplorerConfig', () => {
  const schema: ExplorerConfigSchemaDefinition = new ExplorerConfigSchemaDefinition(
    new ClassToObjectMapper(ConfigKeyFormatter.instance()),
  );
  const explorerVersion: string = '0-36-0';
  const explorerConfigPath = `test/data/v${explorerVersion}-explorer-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(explorerConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = nullToUndefined(parse(yamlData));
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const ec = await schema.transform(plainObject);
      expect(ec).to.not.be.undefined.and.to.not.be.null;
      expect(ec).to.be.instanceOf(ExplorerConfigSchema);
      expect(typeof ec.schemaVersion).to.eq('number');

      // Verify helmChart properties
      expect(ec.helmChart).to.be.instanceOf(HelmChartSchema);
      expect(ec.helmChart.name).to.eq('explorer-deployment');
      expect(ec.helmChart.release).to.eq('explorer-deployment');
      expect(ec.helmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');
    });

    it('should transform class to plain', async () => {
      const helmChart = new HelmChartSchema(
        'explorer-deployment',
        undefined,
        'explorer-deployment',
        'oci://ghcr.io/hashgraph/solo-charts',
      );

      const ec = new ExplorerConfigSchema(
        1,
        helmChart
      );

      const newPlainObject: object = instanceToPlain(ec);

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