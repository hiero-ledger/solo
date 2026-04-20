// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import yaml from 'yaml';
import * as version from '../../../version.js';
import {DefaultOneShotCommand} from '../../../src/commands/one-shot/default-one-shot.js';
import {type FalconPrepareConfig} from '../../../src/commands/one-shot/falcon-prepare-config.js';

function createDefaultConfig(overrides: Partial<FalconPrepareConfig> = {}): FalconPrepareConfig {
  return {
    numberOfConsensusNodes: 1,
    releaseTag: version.HEDERA_PLATFORM_VERSION,
    mirrorNodeVersion: version.MIRROR_NODE_VERSION,
    relayRelease: version.HEDERA_JSON_RPC_RELAY_VERSION,
    blockNodeChartVersion: version.BLOCK_NODE_VERSION,
    explorerVersion: version.EXPLORER_VERSION,
    soloChartVersion: version.SOLO_CHART_VERSION,
    loadBalancer: false,
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

    expect(parsed.network['--release-tag']).to.equal(version.HEDERA_PLATFORM_VERSION);
    expect(parsed.setup['--release-tag']).to.equal(version.HEDERA_PLATFORM_VERSION);
    expect(parsed.mirrorNode['--mirror-node-version']).to.equal(version.MIRROR_NODE_VERSION);
    expect(parsed.relayNode['--relay-release']).to.equal(version.HEDERA_JSON_RPC_RELAY_VERSION);
    expect(parsed.blockNode['--chart-version']).to.equal(version.BLOCK_NODE_VERSION);
    expect(parsed.explorerNode['--explorer-version']).to.equal(version.EXPLORER_VERSION);
    expect(parsed.network['--solo-chart-version']).to.equal(version.SOLO_CHART_VERSION);
    expect(parsed.explorerNode['--solo-chart-version']).to.equal(version.SOLO_CHART_VERSION);
  });

  it('should apply user-provided version overrides', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      releaseTag: 'v0.99.0',
      mirrorNodeVersion: 'v0.200.0',
      relayRelease: '0.50.0',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string>> = yaml.parse(output);

    expect(parsed.network['--release-tag']).to.equal('v0.99.0');
    expect(parsed.setup['--release-tag']).to.equal('v0.99.0');
    expect(parsed.mirrorNode['--mirror-node-version']).to.equal('v0.200.0');
    expect(parsed.relayNode['--relay-release']).to.equal('0.50.0');
  });

  it('should apply mirror ingress setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({enableMirrorIngress: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.mirrorNode['--enable-ingress']).to.equal(false);
  });

  it('should use hardcoded defaults for non-prompted fields', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.explorerNode['--enable-ingress']).to.equal(true);
    expect(parsed.explorerNode['--domain-name']).to.equal('');
    expect(parsed.mirrorNode['--domain-name']).to.equal('');
    expect(parsed.network['--storage-type']).to.equal('');
    expect(parsed.mirrorNode['--storage-type']).to.equal('');
  });

  it('should apply developer options', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      enableDevChartMode: true,
      localBuildPath: '/path/to/build',
      debugNodeAlias: 'node1',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.setup['--dev']).to.equal(true);
    expect(parsed.setup['--local-build-path']).to.equal('/path/to/build');
    expect(parsed.network['--debug-node-alias']).to.equal('node1');
    expect(parsed.consensusNode['--debug-node-alias']).to.equal('node1');
    expect(parsed.blockNode['--dev']).to.equal(true);
  });

  it('should apply port forwarding setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({forcePortForward: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.consensusNode['--force-port-forward']).to.equal(false);
    expect(parsed.mirrorNode['--force-port-forward']).to.equal(false);
    expect(parsed.relayNode['--force-port-forward']).to.equal(false);
    expect(parsed.explorerNode['--force-port-forward']).to.equal(false);
  });

  it('should include header comment with usage and component toggle hints', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);

    expect(output).to.match(/^# One-Shot Falcon Deployment Configuration/);
    expect(output).to.include('solo one-shot falcon deploy --values-file');
    expect(output).to.include('--deploy-mirror-node false');
    expect(output).to.include('--deploy-explorer false');
    expect(output).to.include('--deploy-relay false');
  });
});
