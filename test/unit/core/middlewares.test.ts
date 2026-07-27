// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';

import {Container} from '../../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {type Middlewares} from '../../../src/core/middlewares.js';
import {type DeprecationRegistry} from '../../../src/core/deprecation-registry.js';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';

describe('Middlewares.warnDeprecatedFlags', (): void => {
  const temporaryFlag: CommandFlag = {
    constName: 'temporaryDeprecatedFlag',
    name: 'temporary-deprecated-flag',
    definition: {
      describe: 'a flag that exists only for this test',
      type: 'boolean',
      deprecated: {since: '0.84.0', removalIssue: 5181, replacement: '--replacement-flag'},
    },
    prompt: undefined,
  };

  let middlewares: Middlewares;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: unknown[]) => void;
  let originalArgv: string[];

  beforeEach((): void => {
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    middlewares = container.resolve<Middlewares>(InjectTokens.Middlewares);

    Flags.allFlags.push(temporaryFlag);

    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...data: unknown[]): void => {
      consoleOutput.push(data.map(String).join(' '));
    };

    originalArgv = process.argv;
  });

  afterEach((): void => {
    console.log = originalConsoleLog;
    process.argv = originalArgv;
    const index: number = Flags.allFlags.indexOf(temporaryFlag);
    if (index !== -1) {
      Flags.allFlags.splice(index, 1);
    }
  });

  it('warns when a deprecated flag is supplied', (): void => {
    process.argv = ['node', 'solo', '--temporary-deprecated-flag'];

    middlewares.warnDeprecatedFlags()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain('--temporary-deprecated-flag');
    expect(output).to.contain('#5181');
  });

  it('does not warn when the deprecated flag is absent', (): void => {
    process.argv = ['node', 'solo', 'deployment', 'config', 'create'];

    middlewares.warnDeprecatedFlags()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.not.contain('--temporary-deprecated-flag');
  });

  it('warns automatically when a deprecated command is invoked', (): void => {
    const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
    registry.registerCommand('temporary deprecated command', 'subcommand', {
      since: '0.84.0',
      removalIssue: 5181,
      replacement: 'temporary replacement command',
    });

    middlewares.warnDeprecatedCommands()({_: ['temporary', 'deprecated', 'command']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'temporary deprecated command' is deprecated");
    expect(output).to.contain('#5181');
  });

  it('warns for operations beneath a deprecated command group', (): void => {
    const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
    registry.registerCommand('temporary group', 'command', {since: '0.84.0', removalIssue: 5181});

    middlewares.warnDeprecatedCommands()({_: ['temporary', 'group', 'list']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain("'temporary group' is deprecated");
  });
});
