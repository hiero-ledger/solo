// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {MirrorNodeCommand} from '../../../src/commands/mirror-node.js';
import {Flags as flags} from '../../../src/commands/flags.js';

describe('MirrorNodeCommand unit tests', (): void => {
  it('should include componentImage in mirror node add and upgrade flags', (): void => {
    expect(MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional).to.include(flags.componentImage);
    expect(MirrorNodeCommand.UPGRADE_FLAGS_LIST.optional).to.include(flags.componentImage);
  });
});
