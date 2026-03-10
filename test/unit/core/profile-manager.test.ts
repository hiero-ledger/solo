// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';

import fs from 'node:fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../../src/commands/flags.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {ProfileManager} from '../../../src/core/profile-manager.js';
import {getTemporaryDirectory, getTestCacheDirectory} from '../../test-utility.js';
import * as version from '../../../version.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {Templates} from '../../../src/core/templates.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {KubeConfig} from '@kubernetes/client-node';
import sinon from 'sinon';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

describe('ProfileManager', (): void => {
  let temporaryDirectory: string, configManager: ConfigManager, profileManager: ProfileManager, cacheDirectory: string;
  const namespace: NamespaceName = NamespaceName.of('test-namespace');
  const deploymentName: string = 'deployment';
  const kubeConfig: KubeConfig = new KubeConfig();
  kubeConfig.loadFromDefault();
  const consensusNodes: ConsensusNode[] = [
    {
      name: 'node1',
      nodeId: 1,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node1-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
    {
      name: 'node2',
      nodeId: 2,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node2-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
    {
      name: 'node3',
      nodeId: 3,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node3-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
  ];

  let stagingDirectory: string = '';

  before(async () => {
    resetForTest(namespace.name);
    temporaryDirectory = getTemporaryDirectory();
    configManager = container.resolve(InjectTokens.ConfigManager);
    profileManager = new ProfileManager(undefined, undefined, temporaryDirectory);
    configManager.setFlag(flags.nodeAliasesUnparsed, 'node1,node2,node4');
    configManager.setFlag(flags.cacheDir, getTestCacheDirectory('ProfileManager'));
    configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION);
    cacheDirectory = configManager.getFlag<string>(flags.cacheDir) as string;
    configManager.setFlag(flags.apiPermissionProperties, flags.apiPermissionProperties.definition.defaultValue);
    configManager.setFlag(flags.applicationEnv, flags.applicationEnv.definition.defaultValue);
    configManager.setFlag(flags.applicationProperties, flags.applicationProperties.definition.defaultValue);
    configManager.setFlag(flags.bootstrapProperties, flags.bootstrapProperties.definition.defaultValue);
    configManager.setFlag(flags.log4j2Xml, flags.log4j2Xml.definition.defaultValue);
    configManager.setFlag(flags.settingTxt, flags.settingTxt.definition.defaultValue);
    stagingDirectory = Templates.renderStagingDir(
      configManager.getFlag(flags.cacheDir),
      configManager.getFlag(flags.releaseTag),
    );
    if (!fs.existsSync(stagingDirectory)) {
      fs.mkdirSync(stagingDirectory, {recursive: true});
    }

    // @ts-expect-error - TS2339: to mock
    profileManager.remoteConfig.getConsensusNodes = sinon.stub().returns(consensusNodes);

    // @ts-expect-error - TS2339: to mock
    profileManager.remoteConfig.configuration = {
      // @ts-expect-error - TS2339: to mock
      state: {},
      versions: {
        // @ts-expect-error - TS2339: to mock
        consensusNode: version.HEDERA_PLATFORM_VERSION,
      },
    };

    // @ts-expect-error - TS2339: to mock
    profileManager.updateApplicationPropertiesForBlockNode = sinon.stub();

    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();
  });

  after(() => {
    fs.rmSync(temporaryDirectory, {recursive: true});
  });

  describe('determine chart values', () => {
    it('should determine Solo chart values', async () => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const resources = ['templates'];
      for (const directoryName of resources) {
        const sourceDirectory = PathEx.joinWithRealPath(PathEx.join('resources'), directoryName);
        if (!fs.existsSync(sourceDirectory)) {
          continue;
        }

        const destinationDirectory = PathEx.resolve(PathEx.join(cacheDirectory, directoryName));
        if (!fs.existsSync(destinationDirectory)) {
          fs.mkdirSync(destinationDirectory, {recursive: true});
        }

        fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
      }

      const applicationPropertiesFile: string = PathEx.join(cacheDirectory, 'templates', 'application.properties');
      const valuesFileMapping = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        {},
        deploymentName,
        applicationPropertiesFile,
      );
      const valuesFile = Object.values(valuesFileMapping)[0];

      expect(valuesFile).not.to.be.null;
      expect(fs.existsSync(valuesFile)).to.be.ok;

      // validate the yaml
      const valuesYaml: any = yaml.parse(fs.readFileSync(valuesFile).toString());
      expect(valuesYaml.hedera.nodes.length).to.equal(3);
    });

    it('prepareValuesForSoloChart should set the value of a key to the contents of a file', async () => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const file = PathEx.join(temporaryDirectory, 'application.env');
      const fileContents = '# row 1\n# row 2\n# row 3';
      fs.writeFileSync(file, fileContents);
      configManager.setFlag(flags.applicationEnv, file);
      const destinationFile: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
      const applicationPropertiesFile: string = PathEx.join(stagingDirectory, 'templates', 'application.properties');
      fs.cpSync(file, destinationFile, {force: true});
      const cachedValuesFileMapping = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        {},
        deploymentName,
        applicationPropertiesFile,
      );
      const cachedValuesFile = Object.values(cachedValuesFileMapping)[0];
      const valuesYaml: any = yaml.parse(fs.readFileSync(cachedValuesFile).toString());
      expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents);
    });
  });

  describe('prepareConfigText', () => {
    it('should write and return the path to the config.txt file', async () => {
      const destinationPath = PathEx.join(temporaryDirectory, 'staging');
      fs.mkdirSync(destinationPath, {recursive: true});
    });
  });
});
