// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import each from 'mocha-each';
import {Flags as flags} from '../../../src/commands/flags.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../src/integration/kube/resources/config-map/config-map.js';
import yaml from 'yaml';

import * as helpers from '../../../src/core/helpers.js';
import {helmValuesHelper} from '../../../src/core/helm-values-helper.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {type NodeAlias} from '../../../src/types/aliases.js';

function makeConsensusNode(name: NodeAlias, nodeId: number): ConsensusNode {
  return new ConsensusNode(
    name,
    nodeId,
    'solo',
    'cluster',
    'ctx',
    'cluster.local',
    'network-{0}-svc',
    'network-node1-svc.solo.svc.cluster.local',
    [],
    [],
  );
}

function generateAndParse(
  nodes: ConsensusNode[],
  options: Parameters<typeof helmValuesHelper.generateExtraEnvironmentValuesFile>[1],
): {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}; blockNodesJson?: string}[]}} {
  const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gen-env-'));
  try {
    const filePath: string = helmValuesHelper.generateExtraEnvironmentValuesFile(nodes, options, temporaryDirectory);
    const content: string = fs.readFileSync(filePath, 'utf8');
    return yaml.parse(content) as {
      hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}; blockNodesJson?: string}[]};
    };
  } finally {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

describe('Helpers', (): void => {
  each([
    {input: '', output: []},
    {input: 'node1', output: ['node1']},
    {input: 'node1,node3', output: ['node1', 'node3']},
  ]).it('should parse node aliases for input', ({input, output}: {input: string; output: string[]}): void => {
    expect(helpers.parseNodeAliases(input)).to.deep.equal(output);
  });

  each([
    {input: [], output: []},
    {input: [1, 2, 3], output: [1, 2, 3]},
    {input: ['a', '2', '3'], output: ['a', '2', '3']},
  ]).it('should clone array for input', ({input, output}: {input: number[]; output: number[]}): void => {
    const clonedArray: number[] = helpers.cloneArray(input);
    expect(clonedArray).to.deep.equal(output);
    expect(clonedArray).not.to.equal(input); // ensure cloning creates a new array
  });

  it('Should parse argv to args with boolean flag correctly', (): void => {
    const argv: {[p: string]: boolean} = {[flags.quiet.name]: true};
    const result: string = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.quiet.name}`);
  });

  it('Should parse argv to args with flag correctly', (): void => {
    const argv: {[p: string]: string} = {[flags.namespace.name]: 'VALUE'};
    const result: string = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.namespace.name} VALUE`);
  });

  it('Should ipv4ToByteArray convert IPv4 address to string', (): void => {
    const ipV4Address: string = '192.168.0.1';
    const byteString: string = helpers.ipV4ToBase64(ipV4Address);
    expect(byteString).to.equal('wKgAAQ==');
  });

  describe('generateExtraEnvironmentValuesFile', (): void => {
    it('should sanitize -Xms/-Xmx from JAVA_OPTS coming from baseExtraEnvironmentVariables', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms256m -Xmx2g -Dfoo=bar'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dfoo=bar');
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS after debug-node prepend adds base value with heap flags', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          debugNodeAlias: 'node1',
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms512m -Xmx4g -Dfoo=bar'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      // debug jdwp prefix should be present, heap flags should be gone
      expect(javaOptions).to.include('-agentlib:jdwp=');
      expect(javaOptions).to.not.include('-Xms');
      expect(javaOptions).to.not.include('-Xmx');
      expect(javaOptions).to.include('-Dfoo=bar');
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS coming from additionalEnvironmentVariables', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          additionalEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms128m -Xmx1g -Dbaz=qux'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dbaz=qux');
    });

    it('should preserve blockNodesJson from additionalNodeValues in the output structure', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const blockNodesJsonContent: string = JSON.stringify({blockNodes: [{host: 'localhost', port: 8080}]});
      const result: {hedera: {nodes: {blockNodesJson?: string}[]}} = generateAndParse([node], {
        additionalNodeValues: {
          node1: {name: 'node1', nodeId: 0, accountId: '0.0.3', blockNodesJson: blockNodesJsonContent},
        },
      });
      expect(result.hedera.nodes[0].blockNodesJson).to.equal(blockNodesJsonContent);
    });

    it('should not include blockNodesJson in output when not provided', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {blockNodesJson?: string}[]}} = generateAndParse([node], {
        additionalNodeValues: {
          node1: {name: 'node1', nodeId: 0, accountId: '0.0.3'},
        },
      });
      expect(result.hedera.nodes[0].blockNodesJson).to.be.undefined;
    });
  });

  describe('extractPerNodeBlockNodesJsonFromValuesFile', (): void => {
    it('should extract blockNodesJson per node from a YAML values file', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const blockNodesJsonContent: string = JSON.stringify({nodes: [{host: 'block-node', port: 8080}]});
      const valuesContent: string = [
        'hedera:',
        '  nodes:',
        '    - name: node1',
        '      nodeId: 0',
        `      blockNodesJson: '${blockNodesJsonContent}'`,
      ].join('\n');

      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const temporaryFile: string = path.join(temporaryDirectory, 'values.yaml');
      fs.writeFileSync(temporaryFile, valuesContent, 'utf8');
      try {
        const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
          temporaryFile,
          [node],
        );
        expect(result['node1']).to.equal(blockNodesJsonContent);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('should return empty record when file does not exist', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
        '/nonexistent/file.yaml',
        [node],
      );
      expect(result).to.deep.equal({});
    });

    it('should return empty record when hedera.nodes is absent from the file', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const valuesContent: string = 'hedera:\n  configMaps:\n    configTxt: "foo"\n';
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const temporaryFile: string = path.join(temporaryDirectory, 'values.yaml');
      fs.writeFileSync(temporaryFile, valuesContent, 'utf8');
      try {
        const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
          temporaryFile,
          [node],
        );
        expect(result).to.deep.equal({});
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });
  });

  describe('remoteConfigsToDeploymentsTable', (): void => {
    it('should support clusters as an object map', (): void => {
      const remoteConfigs: ConfigMap[] = [
        {
          namespace: NamespaceName.of('default'),
          name: 'remote-config',
          data: {
            'remote-config-data': yaml.stringify({
              clusters: {
                clusterA: {deployment: 'deployment-a'},
              },
            }),
          },
        },
      ];

      const rows: string[] = helpers.remoteConfigsToDeploymentsTable(remoteConfigs);

      expect(rows).to.deep.equal(['Namespace : deployment', 'default : deployment-a']);
    });

    it('should return header only when clusters is missing', (): void => {
      const remoteConfigs: ConfigMap[] = [
        {
          namespace: NamespaceName.of('default'),
          name: 'remote-config',
          data: {
            'remote-config-data': yaml.stringify({}),
          },
        },
      ];

      const rows: string[] = helpers.remoteConfigsToDeploymentsTable(remoteConfigs);

      expect(rows).to.deep.equal(['Namespace : deployment']);
    });
  });
});
