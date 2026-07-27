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

function removeFlag(flag: CommandFlag): void {
  const index: number = Flags.allFlags.indexOf(flag);
  if (index !== -1) {
    Flags.allFlags.splice(index, 1);
  }
}

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

  // Deprecated only under the 'temporary scoped' command group — supported everywhere else.
  const scopedFlag: CommandFlag = {
    constName: 'temporaryScopedFlag',
    name: 'temporary-scoped-flag',
    definition: {
      describe: 'a flag that is deprecated for one command only',
      type: 'boolean',
      deprecated: {
        since: '0.84.0',
        removalIssue: 5181,
        replacement: '--scoped-replacement-flag',
        commands: ['temporary scoped'],
      },
    },
    prompt: undefined,
  };

  let middlewares: Middlewares;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: unknown[]) => void;
  let originalArgv: string[];

  beforeEach((): void => {
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...data: unknown[]): void => {
      consoleOutput.push(data.map(String).join(' '));
    };

    originalArgv = process.argv;

    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    middlewares = container.resolve<Middlewares>(InjectTokens.Middlewares);

    Flags.allFlags.push(temporaryFlag, scopedFlag);
  });

  afterEach((): void => {
    console.log = originalConsoleLog;
    process.argv = originalArgv;
    removeFlag(temporaryFlag);
    removeFlag(scopedFlag);
  });

  it('warns when a deprecated flag is supplied', (): void => {
    process.argv = ['node', 'solo', '--temporary-deprecated-flag'];

    middlewares.warnDeprecatedFlags()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain('--temporary-deprecated-flag');
    expect(output).to.contain("Use '--replacement-flag' instead.");
  });

  it('warns when a flag deprecated for a single command is supplied to that command', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'scoped', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'scoped']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'--temporary-scoped-flag' is deprecated for 'temporary scoped'");
    expect(output).to.contain("Use '--scoped-replacement-flag' instead.");
  });

  it('warns for an operation beneath the command the flag is deprecated for', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'scoped', 'create', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'scoped', 'create']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain(
      "'--temporary-scoped-flag' is deprecated for 'temporary scoped create'",
    );
  });

  it('does not warn when a scoped flag is supplied to a command it is not deprecated for', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'other', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'other']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.not.contain('--temporary-scoped-flag');
  });

  it('warns for an outright deprecated flag regardless of the command invoked', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'other', '--temporary-deprecated-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'other']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'--temporary-deprecated-flag' is deprecated since");
    // An outright deprecation is not tied to a command, so the message names no command scope.
    expect(output).to.not.contain('deprecated for');
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
    expect(output).to.contain("Use 'temporary replacement command' instead.");
  });

  it('warns for operations beneath a deprecated command group', (): void => {
    const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
    registry.registerCommand('temporary group', 'command', {since: '0.84.0', removalIssue: 5181});

    middlewares.warnDeprecatedCommands()({_: ['temporary', 'group', 'list']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain("'temporary group' is deprecated");
  });
});
