// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {Flags} from '../../../src/commands/flags.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import {type CommandFlag} from '../../../src/types/command-flag.js';
import {resetForTest} from '../../test-container.js';

describe('wraps copy parallel flag', (): void => {
  beforeEach((): void => {
    resetForTest();
  });

  it('is registered in the flag registry', (): void => {
    expect(Flags.allFlags).to.include(Flags.wrapsCopyParallel);
    expect(Flags.allFlagsMap.get(Flags.wrapsCopyParallel.name)).to.equal(Flags.wrapsCopyParallel);
  });

  it('defaults to the sequential copy that predates the flag', (): void => {
    expect(Flags.wrapsCopyParallel.definition.type).to.equal('boolean');
    expect(Flags.wrapsCopyParallel.definition.defaultValue).to.be.false;
  });

  it('is offered by consensus network deploy', (): void => {
    const deployFlags: CommandFlag[] = [
      ...NetworkCommand.DEPLOY_FLAGS_LIST.optional,
      ...NetworkCommand.DEPLOY_FLAGS_LIST.required,
    ];

    expect(deployFlags).to.include(Flags.wrapsCopyParallel);
  });

  it('does not prompt, so a non-interactive deploy keeps the default', (): void => {
    expect(Flags.wrapsCopyParallel.prompt).to.be.undefined;
  });
});
