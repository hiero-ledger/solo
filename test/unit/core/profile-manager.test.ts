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
import {type AnyObject, type NodeAliases} from '../../../src/types/aliases.js';
import * as constants from '../../../src/core/constants.js';

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

  before(async (): Promise<void> => {
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

  after((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true});
  });

  describe('determine chart values', (): void => {
    it('should determine Solo chart values', async (): Promise<void> => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const resources: string[] = ['templates'];
      for (const directoryName of resources) {
        const sourceDirectory: string = PathEx.joinWithRealPath(PathEx.join('resources'), directoryName);
        if (!fs.existsSync(sourceDirectory)) {
          continue;
        }

        const destinationDirectory: string = PathEx.resolve(PathEx.join(cacheDirectory, directoryName));
        if (!fs.existsSync(destinationDirectory)) {
          fs.mkdirSync(destinationDirectory, {recursive: true});
        }

        fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
      }

      const applicationPropertiesFile: string = PathEx.join(
        cacheDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      const valuesFileMapping: Record<string, string> = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        deploymentName,
        applicationPropertiesFile,
      );
      const valuesFile: string = Object.values(valuesFileMapping)[0];

      expect(valuesFile).not.to.be.null;
      expect(fs.existsSync(valuesFile)).to.be.ok;

      // validate the yaml
      const valuesYaml: AnyObject = yaml.parse(fs.readFileSync(valuesFile, 'utf8')) as AnyObject;
      expect(valuesYaml.hedera.nodes.length).to.equal(3);
    });

    it('prepareValuesForSoloChart should set the value of a key to the contents of a file', async (): Promise<void> => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const file: string = PathEx.join(temporaryDirectory, 'application.env');
      const fileContents: string = '# row 1\n# row 2\n# row 3';
      fs.writeFileSync(file, fileContents);
      configManager.setFlag(flags.applicationEnv, file);
      const destinationFile: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
      const applicationPropertiesFile: string = PathEx.join(
        stagingDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      fs.cpSync(file, destinationFile, {force: true});
      const cachedValuesFileMapping: Record<string, string> = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        deploymentName,
        applicationPropertiesFile,
      );
      const cachedValuesFile: string = Object.values(cachedValuesFileMapping)[0];
      const valuesYaml: AnyObject = yaml.parse(fs.readFileSync(cachedValuesFile, 'utf8')) as AnyObject;
      expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents);
    });
  });

  describe('prepareConfigText', (): void => {
    it('should write and return the path to the config.txt file', async (): Promise<void> => {
      const destinationPath: string = PathEx.join(temporaryDirectory, 'staging');
      fs.mkdirSync(destinationPath, {recursive: true});
    });
  });

  describe('chainId updates', (): void => {
    it('should update contracts.chainId in application.properties', async (): Promise<void> => {
      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);
      fs.writeFileSync(
        applicationPropertiesPath,
        ['hedera.realm=0', 'contracts.chainId=295', 'hedera.shard=0'].join('\n') + '\n',
        'utf8',
      );

      // @ts-expect-error to access private method
      await profileManager.updateApplicationPropertiesWithChainId(applicationPropertiesPath, '296');

      const updated: string = fs.readFileSync(applicationPropertiesPath, 'utf8');
      expect(updated).to.contain('contracts.chainId=296');
      expect(updated).not.to.contain('contracts.chainId=295');
    });

    it('should update contracts.chainId in bootstrap.properties', async (): Promise<void> => {
      const bootstrapPropertiesPath: string = PathEx.join(temporaryDirectory, 'bootstrap.properties');
      fs.writeFileSync(
        bootstrapPropertiesPath,
        ['foo=bar', 'contracts.chainId=295', 'baz=qux'].join('\n') + '\n',
        'utf8',
      );

      // @ts-expect-error to access private method
      await profileManager.updateBoostrapPropertiesWithChainId(bootstrapPropertiesPath, '296');

      const updated: string = fs.readFileSync(bootstrapPropertiesPath, 'utf8');
      expect(updated).to.contain('contracts.chainId=296');
      expect(updated).not.to.contain('contracts.chainId=295');
    });

    it('prepareStagingDirectory should update chainId in staged application.properties and bootstrap.properties', async (): Promise<void> => {
      const yamlRoot: AnyObject = {};
      const nodeAliases: NodeAliases = ['node1', 'node2', 'node3'];
      const sourceDirectory: string = PathEx.join(temporaryDirectory, 'source-files');
      fs.mkdirSync(sourceDirectory, {recursive: true});

      const applicationPropertiesSourcePath: string = PathEx.join(sourceDirectory, constants.APPLICATION_PROPERTIES);
      const bootstrapPropertiesSourcePath: string = PathEx.join(sourceDirectory, 'bootstrap.properties');
      // eslint-disable-next-line unicorn/prevent-abbreviations
      const applicationEnvSourcePath: string = PathEx.join(sourceDirectory, 'application.env');
      const apiPermissionSourcePath: string = PathEx.join(sourceDirectory, 'api-permission.properties');
      // eslint-disable-next-line unicorn/prevent-abbreviations
      const log4j2SourcePath: string = PathEx.join(sourceDirectory, 'log4j2.xml');
      const settingsSourcePath: string = PathEx.join(sourceDirectory, 'settings.txt');

      fs.writeFileSync(
        applicationPropertiesSourcePath,
        ['hedera.realm=0', 'hedera.shard=0', 'contracts.chainId=295'].join('\n') + '\n',
        'utf8',
      );
      fs.writeFileSync(
        bootstrapPropertiesSourcePath,
        ['contracts.chainId=295', 'some.other.value=true'].join('\n') + '\n',
        'utf8',
      );
      fs.writeFileSync(applicationEnvSourcePath, 'ENV_ONE=value1\n', 'utf8');
      fs.writeFileSync(apiPermissionSourcePath, 'dummy.permission=true\n', 'utf8');
      fs.writeFileSync(log4j2SourcePath, '<Configuration />\n', 'utf8');
      fs.writeFileSync(settingsSourcePath, 'swirld, 123\n', 'utf8');

      configManager.setFlag(flags.applicationProperties, applicationPropertiesSourcePath);
      configManager.setFlag(flags.bootstrapProperties, bootstrapPropertiesSourcePath);
      configManager.setFlag(flags.applicationEnv, applicationEnvSourcePath);
      configManager.setFlag(flags.apiPermissionProperties, apiPermissionSourcePath);
      configManager.setFlag(flags.log4j2Xml, log4j2SourcePath);
      configManager.setFlag(flags.settingTxt, settingsSourcePath);
      configManager.setFlag(flags.chainId, '296');

      // @ts-expect-error to access private property
      sinon.stub(profileManager.accountManager, 'getNodeAccountMap').returns(
        new Map([
          ['node1', '0.0.3'],
          ['node2', '0.0.4'],
          ['node3', '0.0.5'],
        ]),
      );

      // @ts-expect-error to access private property
      sinon.stub(profileManager.localConfig.configuration, 'realmForDeployment').returns(0);
      // @ts-expect-error to access private property
      sinon.stub(profileManager.localConfig.configuration, 'shardForDeployment').returns(0);

      await profileManager.prepareStagingDirectory(
        consensusNodes,
        nodeAliases,
        yamlRoot,
        deploymentName,
        applicationPropertiesSourcePath,
        {
          cacheDir: cacheDirectory,
          releaseTag: version.HEDERA_PLATFORM_VERSION,
          appName: 'HederaNode.jar',
          chainId: '296',
        },
      );

      const stagedApplicationPropertiesPath: string = PathEx.join(
        stagingDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      const stagedBootstrapPropertiesPath: string = PathEx.join(stagingDirectory, 'templates', 'bootstrap.properties');

      const stagedApplicationProperties: string = fs.readFileSync(stagedApplicationPropertiesPath, 'utf8');
      const stagedBootstrapProperties: string = fs.readFileSync(stagedBootstrapPropertiesPath, 'utf8');

      expect(stagedApplicationProperties).to.contain('contracts.chainId=296');
      expect(stagedApplicationProperties).not.to.contain('contracts.chainId=295');

      expect(stagedBootstrapProperties).to.contain('contracts.chainId=296');
      expect(stagedBootstrapProperties).not.to.contain('contracts.chainId=295');

      expect(yamlRoot.hedera.configMaps.applicationProperties).to.contain('contracts.chainId=296');
      expect(yamlRoot.hedera.configMaps.bootstrapProperties).to.contain('contracts.chainId=296');

      sinon.restore();
    });
  });
});
