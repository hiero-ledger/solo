// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {beforeEach} from 'mocha';
import {ClassToObjectMapper} from '../../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchemaDefinition} from '../../../../../../src/data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {SoloConfigSchema} from '../../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {HelmChartSchema} from '../../../../../../src/data/schema/model/common/helm-chart-schema.js';
import {nullToUndefined} from '../../../../../test-utility.js';

describe('SoloConfig', () => {
  const schema: SoloConfigSchemaDefinition = new SoloConfigSchemaDefinition(
    new ClassToObjectMapper(ConfigKeyFormatter.instance()),
  );
  const soloVersion: string = '0-36-0';
  const soloConfigPath = `test/data/v${soloVersion}-solo-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(soloConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = nullToUndefined(parse(yamlData));
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const sc = await schema.transform(plainObject);
      expect(sc).to.not.be.undefined.and.to.not.be.null;
      expect(sc).to.be.instanceOf(SoloConfigSchema);
      expect(typeof sc.schemaVersion).to.eq('number');

      // Verify helmChart properties
      expect(sc.helmChart).to.be.instanceOf(HelmChartSchema);
      expect(sc.helmChart.name).to.eq('solo-deployment');
      expect(sc.helmChart.release).to.eq('solo-deployment');
      expect(sc.helmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');

      // Verify ingressControllerHelmChart properties
      expect(sc.ingressControllerHelmChart).to.be.instanceOf(HelmChartSchema);
      expect(sc.ingressControllerHelmChart.name).to.eq('haproxy-ingress');
      expect(sc.ingressControllerHelmChart.release).to.eq('haproxy-ingress');
      expect(sc.ingressControllerHelmChart.repository).to.eq('https://haproxy-ingress.github.io/charts');

      // Verify clusterSetupHelmChart properties
      expect(sc.clusterSetupHelmChart).to.be.instanceOf(HelmChartSchema);
      expect(sc.clusterSetupHelmChart.name).to.eq('solo-cluster-setup');
      expect(sc.clusterSetupHelmChart.release).to.eq('solo-cluster-setup');
      expect(sc.clusterSetupHelmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');
      expect(sc.clusterSetupHelmChart.ingressControllerPrefix).to.eq('haproxy-ingress.github.io/controller/');

      // Verify certManagerHelmChart properties
      expect(sc.certManagerHelmChart).to.be.instanceOf(HelmChartSchema);
      expect(sc.certManagerHelmChart.name).to.eq('solo-cert-manager');
      expect(sc.certManagerHelmChart.namespace).to.eq('cert-manager');
      expect(sc.certManagerHelmChart.release).to.eq('solo-cert-manager');
      expect(sc.certManagerHelmChart.repository).to.eq('oci://ghcr.io/hashgraph/solo-charts');
    });

    it('should transform class to plain', async () => {
      const helmChart = new HelmChartSchema(
        'solo-deployment',
        undefined,
        'solo-deployment',
        'oci://ghcr.io/hashgraph/solo-charts',
      );
      const ingressControllerHelmChart = new HelmChartSchema(
        'haproxy-ingress',
        undefined,
        'haproxy-ingress',
        'https://haproxy-ingress.github.io/charts',
      );
      const clusterSetupHelmChart = new HelmChartSchema(
        'solo-cluster-setup',
        undefined,
        'solo-cluster-setup',
        'oci://ghcr.io/hashgraph/solo-charts',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'haproxy-ingress.github.io/controller/',
      );
      const certManagerHelmChart = new HelmChartSchema(
        'solo-cert-manager',
        'cert-manager',
        'solo-cert-manager',
        'oci://ghcr.io/hashgraph/solo-charts',
      );

      const sc = new SoloConfigSchema(
        1,
        helmChart,
        ingressControllerHelmChart,
        clusterSetupHelmChart,
        certManagerHelmChart,
      );

      const newPlainObject: object = instanceToPlain(sc);

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
