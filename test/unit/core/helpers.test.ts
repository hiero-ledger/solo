// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import each from 'mocha-each';
import {Flags as flags} from '../../../src/commands/flags.js';

import * as helpers from '../../../src/core/helpers.js';

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

  describe('Helm Java Environment Variables Validation', (): void => {
    it('should pass validation when all default JVM env vars are present', (): void => {
      const helmCommand: string =
        '--set "hedera.nodes[0].root.extraEnv[0].name=JAVA_HEAP_MIN" ' +
        '--set "hedera.nodes[0].root.extraEnv[0].value=256m" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].name=JAVA_HEAP_MAX" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].value=6g" ' +
        '--set "hedera.nodes[0].root.extraEnv[2].name=JAVA_OPTS" ' +
        '--set "hedera.nodes[0].root.extraEnv[2].value=-XX:+UseG1GC"';

      expect((): void => {
        helpers.validateHelmJavaEnvVars(helmCommand);
      }).to.not.throw();
    });

    it('should fail validation when JAVA_OPTS is missing', (): void => {
      const helmCommand: string =
        '--set "hedera.nodes[0].root.extraEnv[0].name=JAVA_HEAP_MIN" ' +
        '--set "hedera.nodes[0].root.extraEnv[0].value=256m" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].name=TSS_LIB_WRAPS_ARTIFACTS_PATH" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].value=/some/path"';

      expect((): void => {
        helpers.validateHelmJavaEnvVars(helmCommand);
      }).to.throw(/JAVA_OPTS/);
    });

    it('should fail validation when JAVA_HEAP_MAX is missing', (): void => {
      const helmCommand: string =
        '--set "hedera.nodes[0].root.extraEnv[0].name=JAVA_HEAP_MIN" ' +
        '--set "hedera.nodes[0].root.extraEnv[0].value=256m" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].name=JAVA_OPTS" ' +
        '--set "hedera.nodes[0].root.extraEnv[1].value=-XX:+UseG1GC"';

      expect((): void => {
        helpers.validateHelmJavaEnvVars(helmCommand);
      }).to.throw(/JAVA_HEAP_MAX/);
    });

    it('should fail validation when multiple vars are missing', (): void => {
      const helmCommand: string = '--set "hedera.nodes[0].root.extraEnv[0].name=TSS_LIB_WRAPS_ARTIFACTS_PATH"';

      expect((): void => {
        helpers.validateHelmJavaEnvVars(helmCommand);
      }).to.throw(/Critical JVM environment variables missing/);
    });
  });
});
