// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {beforeEach} from 'mocha';
import {ClassToObjectMapper} from '../../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';
import {
  MirrorNodeConfigSchemaDefinition
} from '../../../../../../src/data/schema/migration/impl/mirror-node/mirror-node-config-schema-definition.js';
import {MirrorNodeConfigSchema} from '../../../../../../src/data/schema/model/mirror-node/mirror-node-config-schema.js';
import {HelmChartSchema} from '../../../../../../src/data/schema/model/common/helm-chart-schema.js';
import {nullToUndefined} from '../../../../../test-utility.js';

describe('MirrorNodeConfig', () => {
  const schema: MirrorNodeConfigSchemaDefinition = new MirrorNodeConfigSchemaDefinition(
    new ClassToObjectMapper(ConfigKeyFormatter.instance()),
  );
  const mirrorNodeVersion: string = '0-36-0';
  const mirrorNodeConfigPath = `test/data/v${mirrorNodeVersion}-mirror-node-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(mirrorNodeConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = nullToUndefined(parse(yamlData));
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const mnc = await schema.transform(plainObject);
      expect(mnc).to.not.be.undefined.and.to.not.be.null;
      expect(mnc).to.be.instanceOf(MirrorNodeConfigSchema);
      expect(typeof mnc.schemaVersion).to.eq('number');

      // Verify helmChart properties
      expect(mnc.helmChart).to.be.instanceOf(HelmChartSchema);
      expect(mnc.helmChart.name).to.eq('mirror-node-deployment');
      expect(mnc.helmChart.release).to.eq('mirror-node-deployment');
      expect(mnc.helmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');
    });

    it('should transform class to plain', async () => {
      const helmChart = new HelmChartSchema(
        'mirror-node-deployment',
        undefined,
        'mirror-node-deployment',
        'oci://ghcr.io/hashgraph/solo-charts',
      );

      const mnc = new MirrorNodeConfigSchema(
        1,
        helmChart
      );

      const newPlainObject: object = instanceToPlain(mnc);

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