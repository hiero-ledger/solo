// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {SemVer} from 'semver';
import {beforeEach} from 'mocha';
import os from 'node:os';
import {LocalConfigSchema} from '../../../../../../src/data/schema/model/local/local-config-schema.js';
import {DeploymentSchema} from '../../../../../../src/data/schema/model/local/deployment-schema.js';
import {LocalConfigSchemaDefinition} from '../../../../../../src/data/schema/migration/impl/local/local-config-schema-definition.js';
import {ClassToObjectMapper} from '../../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ApplicationVersionsSchema} from '../../../../../../src/data/schema/model/common/application-versions-schema.js';
import {
  EXPLORER_VERSION,
  HEDERA_JSON_RPC_RELAY_VERSION,
  HEDERA_PLATFORM_VERSION,
  MIRROR_NODE_VERSION,
  SOLO_CHART_VERSION,
} from '../../../../../../version.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';
import {type ClusterReferences} from '../../../../../../src/types/index.js';

describe('LocalConfig', () => {
  const schema: LocalConfigSchemaDefinition = new LocalConfigSchemaDefinition(
    new ClassToObjectMapper(ConfigKeyFormatter.instance()),
  );
  const soloVersion: string = '0.35.1';
  const localConfigPath = `test/data/v${soloVersion}-local-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(localConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = parse(yamlData);
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const lc = await schema.transform(plainObject);
      expect(lc).to.not.be.undefined.and.to.not.be.null;
      expect(lc).to.be.instanceOf(LocalConfigSchema);
      expect(lc.versions.cli).to.be.instanceOf(SemVer);
      expect(lc.versions.cli).to.deep.equal(new SemVer('0.35.1'));
      expect(lc.deployments).to.have.lengthOf(2);
      expect(lc.deployments[0].name).to.equal('dual-cluster-full-deployment');
      expect(lc.deployments[0].realm).to.equal(0);
      expect(lc.deployments[0].shard).to.equal(0);
      expect(lc.deployments[1].name).to.equal('deployment');
      expect(lc.deployments[1].realm).to.equal(0);
      expect(lc.deployments[1].shard).to.equal(0);
      expect(lc.clusterRefs).to.be.instanceOf(Map);
      expect(lc.clusterRefs).to.have.lengthOf(4);
      expect(lc.userIdentity).to.not.be.undefined.and.to.not.be.null;
      expect(lc.userIdentity.name).to.be.equal(os.userInfo().username);
    });

    it('should transform class to plain', async () => {
      const deployments: DeploymentSchema[] = [
        new DeploymentSchema(
          'dual-cluster-full-deployment',
          'dual-cluster-full',
          ['e2e-cluster-1', 'e2e-cluster-2'],
          0,
          0,
        ),
        new DeploymentSchema('deployment', 'solo-e2e', ['cluster-1'], 0, 0),
      ];

      const clusterReferences: ClusterReferences = new Map<string, string>([
        ['cluster-1', 'context-1'],
        ['cluster-2', 'context-2'],
        ['e2e-cluster-1', 'kind-solo-e2e-c1'],
        ['e2e-cluster-2', 'kind-solo-e2e-c2'],
      ]);

      const versions = new ApplicationVersionsSchema(
        new SemVer(soloVersion),
        new SemVer(SOLO_CHART_VERSION),
        new SemVer(HEDERA_PLATFORM_VERSION),
        new SemVer(MIRROR_NODE_VERSION),
        new SemVer(EXPLORER_VERSION),
        new SemVer(HEDERA_JSON_RPC_RELAY_VERSION),
      );
      const lc = new LocalConfigSchema(2, versions, deployments, clusterReferences);
      const newPlainObject: object = instanceToPlain(lc);

      expect(newPlainObject).to.not.be.undefined.and.to.not.be.null;

      const poClone = instanceToPlain(await schema.transform(plainObject));
      expect(newPlainObject).to.deep.equal(poClone);

      const yaml: string = stringify(newPlainObject, {sortMapEntries: true});
      expect(yaml).to.not.be.undefined.and.to.not.be.null;
      expect(yaml).to.not.be.empty;
      expect(yaml).to.equal(stringify(poClone, {sortMapEntries: true}));
    });
  });
});
