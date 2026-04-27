// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import yaml from 'yaml';
import * as version from '../../../version.js';
import {DefaultOneShotCommand} from '../../../src/commands/one-shot/default-one-shot.js';
import {type FalconPrepareConfig} from '../../../src/commands/one-shot/falcon-prepare-config.js';
import {Flags} from '../../../src/commands/flags.js';
import {optionFromFlag} from '../../../src/commands/command-helpers.js';

function createDefaultConfig(overrides: Partial<FalconPrepareConfig> = {}): FalconPrepareConfig {
  return {
    numberOfConsensusNodes: 1,
    releaseTag: version.HEDERA_PLATFORM_VERSION,
    mirrorNodeVersion: version.MIRROR_NODE_VERSION,
    relayReleaseTag: version.HEDERA_JSON_RPC_RELAY_VERSION,
    chartVersion: version.BLOCK_NODE_VERSION,
    explorerVersion: version.EXPLORER_VERSION,
    soloChartVersion: version.SOLO_CHART_VERSION,
    loadBalancerEnabled: false,
    enableMirrorIngress: true,
    localBuildPath: '',
    debugNodeAlias: '',
    enableDevChartMode: false,
    forcePortForward: true,
    outputPath: './falcon-values.yaml',
    ...overrides,
  };
}

describe('DefaultOneShotCommand.generateFalconValuesYaml', (): void => {
  it('should generate valid YAML with all 7 sections', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, unknown> = yaml.parse(output);

    expect(parsed).to.have.property('network');
    expect(parsed).to.have.property('setup');
    expect(parsed).to.have.property('consensusNode');
    expect(parsed).to.have.property('mirrorNode');
    expect(parsed).to.have.property('relayNode');
    expect(parsed).to.have.property('blockNode');
    expect(parsed).to.have.property('explorerNode');
  });

  it('should use default versions from version.ts', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string>> = yaml.parse(output);

    expect(parsed.network[optionFromFlag(Flags.releaseTag)]).to.equal(version.HEDERA_PLATFORM_VERSION);
    expect(parsed.setup[optionFromFlag(Flags.releaseTag)]).to.equal(version.HEDERA_PLATFORM_VERSION);
    expect(parsed.mirrorNode[optionFromFlag(Flags.mirrorNodeVersion)]).to.equal(version.MIRROR_NODE_VERSION);
    expect(parsed.relayNode[optionFromFlag(Flags.relayReleaseTag)]).to.equal(version.HEDERA_JSON_RPC_RELAY_VERSION);
    expect(parsed.blockNode[optionFromFlag(Flags.blockNodeChartVersion)]).to.equal(version.BLOCK_NODE_VERSION);
    expect(parsed.explorerNode[optionFromFlag(Flags.explorerVersion)]).to.equal(version.EXPLORER_VERSION);
    expect(parsed.network[optionFromFlag(Flags.soloChartVersion)]).to.equal(version.SOLO_CHART_VERSION);
    expect(parsed.explorerNode[optionFromFlag(Flags.soloChartVersion)]).to.equal(version.SOLO_CHART_VERSION);
  });

  it('should apply user-provided version overrides', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      releaseTag: 'v0.99.0',
      mirrorNodeVersion: 'v0.200.0',
      relayReleaseTag: '0.50.0',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string>> = yaml.parse(output);

    expect(parsed.network[optionFromFlag(Flags.releaseTag)]).to.equal('v0.99.0');
    expect(parsed.setup[optionFromFlag(Flags.releaseTag)]).to.equal('v0.99.0');
    expect(parsed.mirrorNode[optionFromFlag(Flags.mirrorNodeVersion)]).to.equal('v0.200.0');
    expect(parsed.relayNode[optionFromFlag(Flags.relayReleaseTag)]).to.equal('0.50.0');
  });

  it('should apply mirror ingress setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({enableMirrorIngress: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.mirrorNode[optionFromFlag(Flags.enableIngress)]).to.equal(false);
  });

  it('should use hardcoded defaults for non-prompted fields', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.explorerNode[optionFromFlag(Flags.enableIngress)]).to.equal(true);
    expect(parsed.explorerNode[optionFromFlag(Flags.domainName)]).to.equal('');
    expect(parsed.mirrorNode[optionFromFlag(Flags.domainName)]).to.equal('');
    expect(parsed.network[optionFromFlag(Flags.storageType)]).to.equal('');
    expect(parsed.mirrorNode[optionFromFlag(Flags.storageType)]).to.equal('');
  });

  it('should apply developer options', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      enableDevChartMode: true,
      localBuildPath: '/path/to/build',
      debugNodeAlias: 'node1',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.setup[optionFromFlag(Flags.devMode)]).to.equal(true);
    expect(parsed.setup[optionFromFlag(Flags.localBuildPath)]).to.equal('/path/to/build');
    expect(parsed.network[optionFromFlag(Flags.debugNodeAlias)]).to.equal('node1');
    expect(parsed.consensusNode[optionFromFlag(Flags.debugNodeAlias)]).to.equal('node1');
    expect(parsed.blockNode[optionFromFlag(Flags.devMode)]).to.equal(true);
  });

  it('should apply port forwarding setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({forcePortForward: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.consensusNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.mirrorNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.relayNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.explorerNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
  });

  it('should include header comment with usage and component toggle hints', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);

    expect(output).to.match(/^# One-Shot Falcon Deployment Configuration/);
    expect(output).to.include(`${DefaultOneShotCommand.FALCON_COMMAND_PATH} deploy`);
    expect(output).to.include(`${optionFromFlag(Flags.valuesFile)}`);
    expect(output).to.include(`${optionFromFlag(Flags.deployMirrorNode)} false`);
    expect(output).to.include(`${optionFromFlag(Flags.deployExplorer)} false`);
    expect(output).to.include(`${optionFromFlag(Flags.deployRelay)} false`);
  });
});
