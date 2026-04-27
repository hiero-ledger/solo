// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {ConsensusCommandDefinition} from '../../../../../../src/commands/command-definitions/consensus-command-definition.js';
import * as constants from '../../../../../../src/core/constants.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {
  buildBlockNodeArgv,
  buildConsensusDeployArgv,
  buildConsensusSetupArgv,
  buildConsensusStartArgv,
  buildExplorerArgv,
  buildMirrorNodeArgv,
  buildRelayArgv,
} from '../../../../../../src/commands/one-shot/orchestrator/deploy/deploy-argv-builders.js';

function makeConfig(overrides: Partial<OneShotSingleDeployConfigClass> = {}): OneShotSingleDeployConfigClass {
  return {
    deployment: 'test-deployment',
    namespace: NamespaceName.of('test-ns'),
    clusterRef: 'test-cluster',
    parallelDeploy: false,
    deployMirrorNode: true,
    deployExplorer: true,
    deployRelay: true,
    minimalSetup: false,
    predefinedAccounts: false,
    versions: {explorer: '2.5.0', soloChart: '', consensus: '', mirror: '', relay: '', blockNode: ''},
    blockNodeConfiguration: {},
    mirrorNodeConfiguration: {},
    explorerNodeConfiguration: {},
    relayNodeConfiguration: {},
    networkConfiguration: {},
    setupConfiguration: {},
    consensusNodeConfiguration: {},
    cacheDir: '/tmp/cache',
    ...overrides,
  } as OneShotSingleDeployConfigClass;
}

describe('buildBlockNodeArgv', (): void => {
  it('includes the deployment flag and value', (): void => {
    const argv: string[] = buildBlockNodeArgv(makeConfig());
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
  });

  it('sets --values-file to BLOCK_NODE_SOLO_DEV_FILE when no existing values file', (): void => {
    const argv: string[] = buildBlockNodeArgv(makeConfig({blockNodeConfiguration: {}}));
    const valueIndex: number = argv.indexOf('--values-file');
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.BLOCK_NODE_SOLO_DEV_FILE);
  });

  it('appends BLOCK_NODE_SOLO_DEV_FILE to an existing values file', (): void => {
    const existingFile: string = '/some/path/values.yaml';
    const argv: string[] = buildBlockNodeArgv(makeConfig({blockNodeConfiguration: {'--values-file': existingFile}}));
    const valueIndex: number = argv.indexOf('--values-file');
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`);
  });

  it('does not mutate blockNodeConfiguration', (): void => {
    const originalFile: string = '/original.yaml';
    const blockNodeConfiguration: Record<string, string> = {'--values-file': originalFile};
    buildBlockNodeArgv(makeConfig({blockNodeConfiguration}));
    expect(blockNodeConfiguration['--values-file']).to.equal(originalFile);
  });
});

describe('buildMirrorNodeArgv', (): void => {
  it('includes deployment flag, cluster-ref, pinger, enable-ingress', (): void => {
    const argv: string[] = buildMirrorNodeArgv(makeConfig());
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
    expect(argv).to.include('--cluster-ref');
    expect(argv).to.include('test-cluster');
    expect(argv).to.include('--pinger');
    expect(argv).to.include('--enable-ingress');
  });

  it('includes the parallel-deploy flag', (): void => {
    const argv: string[] = buildMirrorNodeArgv(makeConfig({parallelDeploy: true}));
    expect(argv).to.include('--parallel-deploy');
    expect(argv).to.include('true');
  });

  it('sets --values-file to MIRROR_NODE_HIKARI_LIMITS_FILE when no existing values file', (): void => {
    const argv: string[] = buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration: {}}));
    const valueIndex: number = argv.indexOf('--values-file');
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.MIRROR_NODE_HIKARI_LIMITS_FILE);
  });

  it('appends MIRROR_NODE_HIKARI_LIMITS_FILE to an existing values file', (): void => {
    const existingFile: string = '/path/to/custom.yaml';
    const argv: string[] = buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration: {'--values-file': existingFile}}));
    const valueIndex: number = argv.indexOf('--values-file');
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`);
  });

  it('does not mutate mirrorNodeConfiguration', (): void => {
    const originalFile: string = '/original.yaml';
    const mirrorNodeConfiguration: Record<string, string> = {'--values-file': originalFile};
    buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration}));
    expect(mirrorNodeConfiguration['--values-file']).to.equal(originalFile);
  });
});

describe('buildExplorerArgv', (): void => {
  it('includes deployment and cluster-ref flags', (): void => {
    const argv: string[] = buildExplorerArgv(makeConfig());
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
    expect(argv).to.include('--cluster-ref');
    expect(argv).to.include('test-cluster');
  });

  it('includes --mirror-node-id set to 1', (): void => {
    const argv: string[] = buildExplorerArgv(makeConfig());
    expect(argv).to.include('--mirror-node-id');
    const idIndex: number = argv.indexOf('--mirror-node-id');
    expect(argv[idIndex + 1]).to.equal('1');
  });

  it('includes --mirror-namespace set to namespace name', (): void => {
    const argv: string[] = buildExplorerArgv(makeConfig());
    expect(argv).to.include('--mirror-namespace');
    const namespaceIndex: number = argv.indexOf('--mirror-namespace');
    expect(argv[namespaceIndex + 1]).to.equal('test-ns');
  });

  it('includes --explorer-version set to config versions.explorer', (): void => {
    const argv: string[] = buildExplorerArgv(makeConfig());
    expect(argv).to.include('--explorer-version');
    const versionIndex: number = argv.indexOf('--explorer-version');
    expect(argv[versionIndex + 1]).to.equal('2.5.0');
  });
});

describe('buildRelayArgv', (): void => {
  it('includes deployment, cluster-ref, and hardcoded node1 alias', (): void => {
    const argv: string[] = buildRelayArgv(makeConfig());
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
    expect(argv).to.include('--cluster-ref');
    expect(argv).to.include('test-cluster');
    expect(argv).to.include('--node-aliases');
    expect(argv).to.include('node1');
  });

  it('includes --mirror-node-id set to 1', (): void => {
    const argv: string[] = buildRelayArgv(makeConfig());
    expect(argv).to.include('--mirror-node-id');
    const idIndex: number = argv.indexOf('--mirror-node-id');
    expect(argv[idIndex + 1]).to.equal('1');
  });

  it('includes --mirror-namespace set to namespace name', (): void => {
    const argv: string[] = buildRelayArgv(makeConfig());
    expect(argv).to.include('--mirror-namespace');
    const namespaceIndex: number = argv.indexOf('--mirror-namespace');
    expect(argv[namespaceIndex + 1]).to.equal('test-ns');
  });
});

describe('buildConsensusDeployArgv', (): void => {
  it('includes consensus deploy command tokens and --deployment flag', (): void => {
    const argv: string[] = buildConsensusDeployArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.DEPLOY_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
  });
});

describe('buildConsensusSetupArgv', (): void => {
  it('includes consensus setup command tokens and --deployment flag', (): void => {
    const argv: string[] = buildConsensusSetupArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.SETUP_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
  });
});

describe('buildConsensusStartArgv', (): void => {
  it('includes consensus start command tokens and --deployment flag', (): void => {
    const argv: string[] = buildConsensusStartArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.START_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include('--deployment');
    expect(argv).to.include('test-deployment');
  });
});
