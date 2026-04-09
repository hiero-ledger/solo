// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import each from 'mocha-each';
import {Flags as flags} from '../../../src/commands/flags.js';

import * as helpers from '../../../src/core/helpers.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';

function makeConsensusNode(name: string, nodeId: number): ConsensusNode {
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

  describe('buildPerNodeExtraEnvironmentValuesStructure', (): void => {
    it('should sanitize -Xms/-Xmx from JAVA_OPTS coming from baseExtraEnvironmentVariables', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: ReturnType<typeof helpers.buildPerNodeExtraEnvironmentValuesStructure> =
        helpers.buildPerNodeExtraEnvironmentValuesStructure([node], {
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms256m -Xmx2g -Dfoo=bar'}],
          },
        });
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dfoo=bar');
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS after debug-node prepend adds base value with heap flags', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: ReturnType<typeof helpers.buildPerNodeExtraEnvironmentValuesStructure> =
        helpers.buildPerNodeExtraEnvironmentValuesStructure([node], {
          debugNodeAlias: 'node1',
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms512m -Xmx4g -Dfoo=bar'}],
          },
        });
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
      const result: ReturnType<typeof helpers.buildPerNodeExtraEnvironmentValuesStructure> =
        helpers.buildPerNodeExtraEnvironmentValuesStructure([node], {
          additionalEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms128m -Xmx1g -Dbaz=qux'}],
          },
        });
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dbaz=qux');
    });
  });
});
